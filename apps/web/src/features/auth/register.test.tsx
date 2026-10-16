import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { apiError, createFakeApi } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

type User = ReturnType<typeof renderApp>['user']

const fill = async (user: User, values: { email: string; username: string; password: string }) => {
  await user.type(await screen.findByLabelText('Email'), values.email)
  await user.type(screen.getByLabelText('Имя пользователя'), values.username)
  await user.type(screen.getByLabelText('Пароль'), values.password)
  await user.click(screen.getByRole('button', { name: 'Продолжить' }))
}

const valid = { email: 'alice@example.com', username: 'alice', password: 'password123' }

describe('register page', () => {
  it('creates the account and opens the app', async () => {
    const api = createFakeApi()
    const { user } = renderApp('/register', { api })

    await fill(user, valid)

    expect(await screen.findByRole('heading', { name: 'Друзья', level: 1 })).toBeVisible()
    // Emails come in the language the app is shown in.
    expect(api.auth.register).toHaveBeenCalledWith({ ...valid, locale: 'ru' })
  })

  it('explains the rules of invalid fields', async () => {
    const api = createFakeApi()
    const { user } = renderApp('/register', { api })

    await fill(user, { email: 'nope', username: 'a', password: 'short' })

    expect(await screen.findByText('Введите корректный email')).toBeVisible()
    expect(screen.getByText(/От 2 до 32 символов/)).toBeVisible()
    expect(screen.getByText('Пароль должен содержать от 8 до 128 символов')).toBeVisible()
    expect(api.auth.register).not.toHaveBeenCalled()
  })

  it('shows "username taken" next to the username field', async () => {
    const api = createFakeApi()
    api.auth.register.mockRejectedValueOnce(apiError(409, 'USERNAME_TAKEN'))
    const { user } = renderApp('/register', { api })

    await fill(user, valid)

    const field = screen.getByLabelText('Имя пользователя')
    expect(await screen.findByText('Это имя пользователя уже занято.')).toBeVisible()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows other server errors above the form', async () => {
    const api = createFakeApi()
    api.auth.register.mockRejectedValueOnce(apiError(429, 'RATE_LIMITED'))
    const { user } = renderApp('/register', { api })

    await fill(user, valid)

    expect(await screen.findByRole('alert')).toHaveTextContent('Слишком много попыток')
  })

  it('tells visitors when registration is closed', async () => {
    renderApp('/register', { registrationMode: 'closed' })

    expect(await screen.findByText(/Регистрация на этом сервере закрыта/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Продолжить' })).not.toBeInTheDocument()
  })
})
