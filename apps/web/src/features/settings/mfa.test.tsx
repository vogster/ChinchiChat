import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

describe('two-factor sign-in settings', () => {
  it('turns on with the password and an app code, then shows the recovery codes', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp('/settings/account', { api })

    await user.click(await screen.findByRole('button', { name: 'Включить 2FA' }))
    const dialog = await screen.findByRole('dialog', { name: 'Двухфакторная аутентификация' })
    await user.type(within(dialog).getByLabelText('Пароль', { exact: true }), 'password123')
    await user.click(within(dialog).getByRole('button', { name: 'Продолжить' }))

    expect(await within(dialog).findByRole('img', { name: 'QR-код для приложения' })).toBeVisible()
    expect(within(dialog).getByText('JBSWY3DPEHPK3PXP')).toBeVisible()
    await user.type(within(dialog).getByLabelText('Код из приложения', { exact: true }), '123456')
    await user.click(within(dialog).getByRole('button', { name: 'Включить' }))

    const codes = await within(dialog).findByRole('list', { name: 'Коды восстановления' })
    expect(within(codes).getByText('aaaaa-bbbbb')).toBeVisible()
    expect(api.mfa.setup).toHaveBeenCalledWith('password123')
    expect(api.mfa.enable).toHaveBeenCalledWith('123456')
    await user.click(within(dialog).getByRole('button', { name: 'Я сохранил коды' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Включена')).toBeVisible()
  })

  it('turns off, or renews the recovery codes, with the password and a code', async () => {
    const api = createFakeApi({ user: { ...testUser, mfaEnabled: true } })
    const { user } = renderApp('/settings/account', { api })

    await user.click(await screen.findByRole('button', { name: 'Новые коды восстановления' }))
    let dialog = await screen.findByRole('dialog', { name: 'Новые коды восстановления' })
    await user.type(within(dialog).getByLabelText('Пароль', { exact: true }), 'password123')
    await user.type(within(dialog).getByLabelText('Код подтверждения', { exact: true }), '654321')
    await user.click(within(dialog).getByRole('button', { name: 'Продолжить' }))
    expect(await within(dialog).findByText('eeeee-fffff')).toBeVisible()
    expect(api.mfa.renewRecoveryCodes).toHaveBeenCalledWith({
      password: 'password123',
      code: '654321',
    })
    await user.click(within(dialog).getByRole('button', { name: 'Я сохранил коды' }))

    await user.click(await screen.findByRole('button', { name: 'Отключить 2FA' }))
    dialog = await screen.findByRole('dialog', { name: 'Отключить 2FA' })
    await user.type(within(dialog).getByLabelText('Пароль', { exact: true }), 'password123')
    await user.type(
      within(dialog).getByLabelText('Код подтверждения', { exact: true }),
      'abcde-fghij',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Отключить' }))

    await waitFor(() =>
      expect(api.mfa.disable).toHaveBeenCalledWith({
        password: 'password123',
        code: 'abcde-fghij',
      }),
    )
    expect(await screen.findByText('Выключена')).toBeVisible()
  })
})
