import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { apiError, createFakeApi } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const fillAndSubmit = async (
  user: ReturnType<typeof renderApp>['user'],
  login: string,
  password: string,
) => {
  const submit = await screen.findByRole('button', { name: 'Войти' })
  if (login) await user.type(screen.getByLabelText('Имя пользователя или email'), login)
  if (password) await user.type(screen.getByLabelText('Пароль'), password)
  await user.click(submit)
}

describe('login page', () => {
  it('signs in and opens the app', async () => {
    const api = createFakeApi()
    const { user, router } = renderApp('/login', { api })

    await fillAndSubmit(user, 'Alice', 'password123')

    expect(await screen.findByRole('heading', { name: 'Друзья', level: 1 })).toBeVisible()
    expect(api.auth.login).toHaveBeenCalledWith({ login: 'alice', password: 'password123' })
    expect(router.state.location.pathname).toBe('/')
  })

  it('asks for the authenticator code when the account has 2FA', async () => {
    const api = createFakeApi()
    api.auth.login.mockResolvedValueOnce({ mfaTicket: 't'.repeat(43) })
    const { user, router } = renderApp('/login', { api })

    await fillAndSubmit(user, 'alice', 'password123')
    const code = await screen.findByLabelText('Код подтверждения', { exact: true })
    await user.type(code, '123 456')
    await user.click(screen.getByRole('button', { name: 'Подтвердить' }))

    expect(await screen.findByRole('heading', { name: 'Друзья', level: 1 })).toBeVisible()
    expect(api.auth.loginMfa).toHaveBeenCalledWith({ ticket: 't'.repeat(43), code: '123456' })
    expect(router.state.location.pathname).toBe('/')
  })

  it('returns to the original page after signing in', async () => {
    const { user, router } = renderApp('/login?redirect=%2F%3Ftab%3Dfriends')

    await fillAndSubmit(user, 'alice', 'password123')

    await screen.findByRole('heading', { name: 'Друзья', level: 1 })
    expect(router.state.location.search).toEqual({ tab: 'friends' })
  })

  it('ignores redirects to other sites', async () => {
    const { user, router } = renderApp('/login?redirect=https%3A%2F%2Fevil.example')

    await fillAndSubmit(user, 'alice', 'password123')

    await screen.findByRole('heading', { name: 'Друзья', level: 1 })
    expect(router.state.location.href).toBe('/')
  })

  it('validates required fields without calling the API', async () => {
    const api = createFakeApi()
    const { user } = renderApp('/login', { api })

    await fillAndSubmit(user, '', '')

    expect(await screen.findAllByText('Обязательное поле')).toHaveLength(2)
    expect(api.auth.login).not.toHaveBeenCalled()
  })

  it('shows a translated error for wrong credentials', async () => {
    const api = createFakeApi()
    api.auth.login.mockRejectedValueOnce(apiError(401, 'INVALID_CREDENTIALS'))
    const { user } = renderApp('/login', { api })

    await fillAndSubmit(user, 'alice', 'wrong-password')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Неверное имя пользователя, email или пароль.',
    )
  })

  it('links to registration and password reset', async () => {
    renderApp('/login')

    expect(await screen.findByRole('link', { name: 'Зарегистрироваться' })).toHaveAttribute(
      'href',
      '/register',
    )
    expect(screen.getByRole('link', { name: 'Забыли пароль?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    )
  })
})
