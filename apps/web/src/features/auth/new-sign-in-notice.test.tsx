import { act, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testQrLogin, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const SIGN_IN = {
  qrLoginId: testQrLogin.id,
  userAgent: testQrLogin.userAgent,
  ipAddress: '203.0.113.5',
  createdAt: '2026-10-22T10:00:00.000Z',
}

describe('a sign-in by QR, seen from the other sessions', () => {
  it('asks whether it was them, and leads to the devices if not', async () => {
    const api = createFakeApi({ user: testUser })
    const { gateway, user, router } = renderApp('/', { api })
    await screen.findByRole('heading', { name: 'Друзья', level: 1 })

    act(() => gateway.emit('SESSION_CREATE', SIGN_IN))

    const notice = await screen.findByRole('dialog', { name: 'Новый вход в аккаунт' })
    expect(within(notice).getByText('Chrome · Windows')).toBeVisible()
    expect(within(notice).getByText('203.0.113.5')).toBeVisible()
    await user.click(within(notice).getByRole('button', { name: 'Это не я' }))

    expect(screen.queryByRole('dialog', { name: 'Новый вход в аккаунт' })).toBeNull()
    expect(router.state.location.search).toMatchObject({ settings: 'sessions' })
  })

  it('goes away when it was them', async () => {
    const api = createFakeApi({ user: testUser })
    const { gateway, user } = renderApp('/', { api })
    await screen.findByRole('heading', { name: 'Друзья', level: 1 })

    act(() => gateway.emit('SESSION_CREATE', SIGN_IN))
    const notice = await screen.findByRole('dialog', { name: 'Новый вход в аккаунт' })
    await user.click(within(notice).getByRole('button', { name: 'Это я' }))

    expect(screen.queryByRole('dialog', { name: 'Новый вход в аккаунт' })).toBeNull()
  })

  it('stays quiet on the device that approved it', async () => {
    const api = createFakeApi({ user: testUser })
    const { gateway, user } = renderApp(`/?qr=${testQrLogin.id}`, { api })
    const approval = await screen.findByRole('dialog', { name: 'Вход на новом устройстве' })
    await user.click(await within(approval).findByRole('button', { name: '47' }))
    await within(approval).findByText('Готово: устройство входит в аккаунт.')

    act(() => gateway.emit('SESSION_CREATE', SIGN_IN))

    expect(screen.queryByRole('dialog', { name: 'Новый вход в аккаунт' })).toBeNull()
  })
})
