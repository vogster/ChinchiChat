import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { apiError, createFakeApi, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const TOKEN = 'C'.repeat(43)

const openDialog = async (user: ReturnType<typeof renderApp>['user']) => {
  await user.click(await screen.findByRole('button', { name: 'Изменить email' }))
  return screen.findByRole('dialog', { name: 'Изменить email' })
}

describe('changing the email', () => {
  it('sends a link to the new address from the account settings', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp('/?settings=account', { api })

    const dialog = await openDialog(user)
    await user.type(within(dialog).getByLabelText('Новый email'), ' New@Example.com ')
    await user.type(within(dialog).getByLabelText('Пароль'), 'password123')
    await user.click(within(dialog).getByRole('button', { name: 'Отправить ссылку' }))

    expect(await within(dialog).findByText(/Ссылка отправлена на new@example\.com/)).toBeVisible()
    expect(api.auth.changeEmail).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'password123',
    })
  })

  it('asks for a code when two-factor sign-in is on, and shows what went wrong', async () => {
    const api = createFakeApi({ user: { ...testUser, mfaEnabled: true } })
    const { user } = renderApp('/?settings=account', { api })

    const dialog = await openDialog(user)
    await user.type(within(dialog).getByLabelText('Новый email'), 'new@example.com')
    await user.type(within(dialog).getByLabelText('Пароль'), 'password123')
    await user.click(within(dialog).getByRole('button', { name: 'Далее' }))
    const send = await within(dialog).findByRole('button', { name: 'Отправить ссылку' })
    expect(send).toBeDisabled()
    api.auth.changeEmail.mockRejectedValueOnce(apiError(400, 'INVALID_MFA_CODE'))
    await user.type(within(dialog).getByLabelText('Код из приложения'), '123456')
    await user.click(send)

    expect(await within(dialog).findByRole('alert')).toBeVisible()
    expect(api.auth.changeEmail).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'password123',
      code: '123456',
    })
  })

  it('checks the address before sending', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp('/?settings=account', { api })

    const dialog = await openDialog(user)
    await user.type(within(dialog).getByLabelText('Новый email'), 'not-an-email')
    await user.type(within(dialog).getByLabelText('Пароль'), 'password123')
    await user.click(within(dialog).getByRole('button', { name: 'Отправить ссылку' }))

    expect(await within(dialog).findByText('Введите корректный email')).toBeVisible()
    expect(api.auth.changeEmail).not.toHaveBeenCalled()
  })

  it('is offered right in the banner while the address is not confirmed', async () => {
    const api = createFakeApi({ user: { ...testUser, emailVerified: false } })
    const { user } = renderApp('/', { api })

    const dialog = await openDialog(user)
    expect(within(dialog).getByLabelText('Новый email')).toBeVisible()
  })
})

describe('the link from the new address', () => {
  it('moves the account there once', async () => {
    const api = createFakeApi()
    renderApp(`/confirm-email#token=${TOKEN}`, { api })

    expect(await screen.findByRole('status')).toHaveTextContent(
      'теперь email учётной записи — new@example.com',
    )
    expect(api.auth.confirmEmailChange).toHaveBeenCalledTimes(1)
    expect(api.auth.confirmEmailChange).toHaveBeenCalledWith(TOKEN)
  })

  it('says when the address was taken meanwhile', async () => {
    const api = createFakeApi()
    api.auth.confirmEmailChange.mockRejectedValueOnce(apiError(409, 'EMAIL_TAKEN'))
    renderApp(`/confirm-email#token=${TOKEN}`, { api })

    expect(await screen.findByRole('alert')).toHaveTextContent('Этот email уже зарегистрирован')
  })

  it('handles a link without a token', async () => {
    renderApp('/confirm-email')
    expect(await screen.findByRole('alert')).toHaveTextContent('Ссылка недействительна')
  })
})
