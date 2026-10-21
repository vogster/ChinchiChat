import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { apiError, createFakeApi, testQrLogin, testQrTicket, testUser } from '../../test/fake-api'
import { TEST_RECOVERY_KEY } from '../../test/fake-e2ee'
import { renderApp } from '../../test/render-app'
import { createEphemeral } from '../e2ee/approval-crypto'
import { openFromApprover, sealForNewDevice } from './qr-login-crypto'

import type { ApproveQrLoginRequest, CreateQrLoginRequest } from '@chinchi/shared'

const FRIENDS = { name: 'Друзья', level: 1 } as const

describe('signing in with a QR code, on the new device', () => {
  it('shows the QR and the short code beside the password fields', async () => {
    const api = createFakeApi()
    renderApp('/login', { api })

    expect(await screen.findByRole('img', { name: 'QR-код для входа' })).toBeVisible()
    expect(screen.getByText('KQ7M-2PXD')).toBeVisible()
    // No number yet: it comes once a signed-in device opens the sign-in.
    expect(screen.queryByRole('status', { name: 'Число для подтверждения' })).toBeNull()
    expect(screen.getByLabelText('Пароль')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Войти по QR-коду' })).toBeNull()
    // The new device sends its key, so encryption can follow it.
    const body = api.auth.qr.create.mock.calls[0]?.[0] as CreateQrLoginRequest
    expect(body.publicKey).toMatch(/^[A-Za-z0-9+/]{43}=$/)
    expect(api.auth.qr.claim).toHaveBeenCalledWith(testQrTicket.id, testQrTicket.secret)
  })

  it('keeps the QR behind a button on a phone, with a way back', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }))
    try {
      const api = createFakeApi()
      const { user } = renderApp('/login', { api })

      await user.click(await screen.findByRole('button', { name: 'Войти по QR-коду' }))
      expect(await screen.findByRole('img', { name: 'QR-код для входа' })).toBeVisible()
      expect(screen.queryByLabelText('Пароль')).toBeNull()

      await user.click(screen.getByRole('button', { name: 'Войти с паролем' }))
      expect(await screen.findByLabelText('Пароль')).toBeVisible()
      expect(screen.queryByRole('img', { name: 'QR-код для входа' })).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('signs in once approved, taking the recovery key handed over with it', async () => {
    const api = createFakeApi()
    api.auth.qr.claim.mockImplementation(async (id: string) => {
      const body = api.auth.qr.create.mock.calls[0]?.[0] as CreateQrLoginRequest
      const sealed = await sealForNewDevice(id, body.publicKey ?? '', TEST_RECOVERY_KEY)
      return { state: 'approved' as const, user: testUser, ...sealed }
    })
    const { router, e2ee } = renderApp('/login', { api })

    expect(await screen.findByRole('heading', FRIENDS)).toBeVisible()
    expect(router.state.location.pathname).toBe('/')
    await vi.waitFor(() => expect(e2ee.recovery.useKey).toHaveBeenCalledWith(TEST_RECOVERY_KEY))
  })

  it('shows the number to pick once the other device opened the sign-in', async () => {
    const api = createFakeApi()
    api.auth.qr.claim.mockResolvedValue({ state: 'scanned', match: 47 })
    renderApp('/login', { api })

    const number = await screen.findByRole('status', { name: 'Число для подтверждения' })
    expect(number).toHaveTextContent('47')
    expect(screen.getByText('Выберите это число на устройстве, где вы уже вошли')).toBeVisible()
    // The QR has done its job: the number takes its place.
    expect(screen.queryByRole('img', { name: 'QR-код для входа' })).toBeNull()
  })

  it('starts over with a new QR when the old one is gone', async () => {
    const api = createFakeApi()
    api.auth.qr.claim.mockRejectedValueOnce(apiError(404, 'UNKNOWN_QR_LOGIN'))
    renderApp('/login', { api })

    await vi.waitFor(() => expect(api.auth.qr.create).toHaveBeenCalledTimes(2))
  })
})

describe('approving a QR sign-in, on a signed-in device', () => {
  it('shows who asks and hands encryption over to the key from the QR', async () => {
    const newDevice = await createEphemeral()
    const api = createFakeApi({ user: testUser })
    api.auth.qr.find.mockResolvedValue({
      login: { ...testQrLogin, publicKey: newDevice.publicKey },
    })
    const { user } = renderApp(
      `/?qr=${testQrLogin.id}&qrKey=${encodeURIComponent(newDevice.publicKey)}`,
      { api },
    )

    const dialog = await screen.findByRole('dialog', { name: 'Вход на новом устройстве' })
    expect(await within(dialog).findByText('Chrome · Windows')).toBeVisible()
    expect(within(dialog).getByText('203.0.113.5')).toBeVisible()
    expect(within(dialog).getByText(/это мошенники/)).toBeVisible()
    const handOver = await within(dialog).findByRole('switch', {
      name: 'Перенести зашифрованные беседы',
    })
    expect(handOver).toBeChecked()
    // No single "yes": the number shown on the new device, among others.
    expect(within(dialog).queryByRole('button', { name: 'Впустить' })).toBeNull()
    expect(within(dialog).getByText('Какое число показано на новом устройстве?')).toBeVisible()
    expect(
      within(within(dialog).getByRole('group', { name: 'Число с нового устройства' }))
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['23', '47', '81'])

    await user.click(within(dialog).getByRole('button', { name: '47' }))

    expect(await within(dialog).findByText('Готово: устройство входит в аккаунт.')).toBeVisible()
    const [id, body] = api.auth.qr.approve.mock.calls[0] as [string, ApproveQrLoginRequest]
    expect(id).toBe(testQrLogin.id)
    expect(body.match).toBe(47)
    expect(await openFromApprover(id, newDevice, body.approverKey ?? '', body.sealed ?? '')).toBe(
      TEST_RECOVERY_KEY,
    )
  })

  it('lets in without encryption when the key did not come in the QR', async () => {
    const api = createFakeApi({ user: testUser })
    api.auth.qr.find.mockResolvedValue({
      login: { ...testQrLogin, publicKey: 'B'.repeat(43) + '=' },
    })
    const { user } = renderApp(`/?qr=${testQrLogin.id}`, { api })

    const dialog = await screen.findByRole('dialog', { name: 'Вход на новом устройстве' })
    await within(dialog).findByText('Chrome · Windows')
    expect(within(dialog).queryByRole('switch')).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '47' }))

    await vi.waitFor(() =>
      expect(api.auth.qr.approve).toHaveBeenCalledWith(testQrLogin.id, { match: 47 }),
    )
  })

  it('ends the sign-in when the wrong number is picked', async () => {
    const api = createFakeApi({ user: testUser })
    api.auth.qr.approve.mockRejectedValue(apiError(403, 'QR_LOGIN_MISMATCH'))
    const { user } = renderApp(`/?qr=${testQrLogin.id}`, { api })

    const dialog = await screen.findByRole('dialog', { name: 'Вход на новом устройстве' })
    await user.click(await within(dialog).findByRole('button', { name: '23' }))

    expect(await within(dialog).findByText(/Число не совпало/)).toBeVisible()
    // Nothing more to pick: that sign-in is over.
    expect(within(dialog).queryByRole('button', { name: '47' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Понятно' })).toBeVisible()
  })

  it('does not hand encryption to a key other than the scanned one', async () => {
    const api = createFakeApi({ user: testUser })
    api.auth.qr.find.mockResolvedValue({
      login: { ...testQrLogin, publicKey: 'B'.repeat(43) + '=' },
    })
    renderApp(`/?qr=${testQrLogin.id}&qrKey=${encodeURIComponent('C'.repeat(43) + '=')}`, { api })

    const dialog = await screen.findByRole('dialog', { name: 'Вход на новом устройстве' })
    await within(dialog).findByText('Chrome · Windows')
    expect(within(dialog).queryByRole('switch')).not.toBeInTheDocument()
  })

  it('says so when the sign-in expired, and closes', async () => {
    const api = createFakeApi({ user: testUser })
    api.auth.qr.find.mockRejectedValue(apiError(404, 'UNKNOWN_QR_LOGIN'))
    const { user, router } = renderApp(`/?qr=${testQrLogin.id}`, { api })

    const dialog = await screen.findByRole('dialog', { name: 'Вход на новом устройстве' })
    expect(await within(dialog).findByText(/Код входа устарел/)).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Понятно' }))

    expect(screen.queryByRole('dialog', { name: 'Вход на новом устройстве' })).toBeNull()
    expect(router.state.location.search).toEqual({})
  })

  it('opens from the short code typed in the settings', async () => {
    const api = createFakeApi({ user: testUser })
    const { user, router } = renderApp('/?settings=sessions', { api })

    await user.type(await screen.findByLabelText('Код со второго устройства'), 'kq7m 2pxd')
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))

    expect(await screen.findByRole('dialog', { name: 'Вход на новом устройстве' })).toBeVisible()
    expect(api.auth.qr.findByCode).toHaveBeenCalledWith('KQ7M2PXD')
    expect(router.state.location.search).toEqual({ qr: testQrLogin.id })
  })

  it('rejects a code that cannot be one', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp('/?settings=sessions', { api })

    await user.type(await screen.findByLabelText('Код со второго устройства'), 'hello')
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))

    expect(await screen.findByText(/Код — 8 букв и цифр/)).toBeVisible()
    expect(api.auth.qr.findByCode).not.toHaveBeenCalled()
  })
})
