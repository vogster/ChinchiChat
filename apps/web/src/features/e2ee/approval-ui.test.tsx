import { act, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { createFakeApi, testApproval, testFriend, testUser } from '../../test/fake-api'
import { TEST_RECOVERY_KEY } from '../../test/fake-e2ee'
import { renderApp } from '../../test/render-app'

import type { Device, PrivateChannel } from '@chinchi/shared'

const encryptedDm: PrivateChannel = {
  id: '802',
  type: 'dm',
  name: null,
  ownerId: null,
  recipients: [testFriend],
  lastMessageId: null,
  encrypted: true,
}
const DM_PATH = `/channels/@me/${encryptedDm.id}`
const EMOJI = ['🐶', '🐱', '🦁', '🐴']
const myDevice = (id: string): Device => ({
  id,
  userId: testUser.id,
  name: `Устройство ${id}`,
  signaturePublicKey: 'a2V5',
  createdAt: '2026-10-01T10:00:00.000Z',
  revokedAt: null,
  userSignature: null,
})
const withEncryptedDm = ({ otherDevice = true } = {}) => {
  const api = createFakeApi({ user: testUser })
  api.dms.list.mockResolvedValue({ channels: [encryptedDm] })
  // The fake e2ee client says this browser is device 700.
  api.e2ee.myDevices.mockResolvedValue({
    devices: otherDevice ? [myDevice('700'), myDevice('701')] : [myDevice('700')],
  })
  return api
}

describe('approving a new device', () => {
  beforeEach(() => sessionStorage.clear())

  it('passes approval changes from the gateway to the encryption client', async () => {
    const { gateway, e2ee } = renderApp('/', { api: withEncryptedDm() })
    await screen.findByRole('heading', { name: 'Друзья', level: 1 })

    act(() => gateway.emit('E2EE_APPROVAL_UPDATE', testApproval))

    await waitFor(() => expect(e2ee.approvals.handle).toHaveBeenCalledWith(testApproval))
  })

  it('on an approved device: asks "is this you?", shows the emoji, and says yes or no', async () => {
    const { user, e2ee } = renderApp('/', { api: withEncryptedDm() })
    await screen.findByRole('heading', { name: 'Друзья', level: 1 })
    const view = { approvalId: '950', role: 'approver' as const, deviceName: 'Телефон' }

    // Every approved device asks; nothing is sent until the person picks one.
    act(() => e2ee.approvals.emit([{ ...view, state: 'asked', emoji: null }]))
    const dialog = await screen.findByRole('dialog', { name: 'Новый вход' })
    expect(dialog).toHaveTextContent('Новый вход: Телефон. Это вы?')
    expect(within(dialog).queryByRole('button', { name: 'Да, эмодзи совпадают' })).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Сравнить эмодзи здесь' }))
    expect(e2ee.approvals.compareHere).toHaveBeenCalledWith('950')

    act(() => e2ee.approvals.emit([{ ...view, state: 'waiting', emoji: null }]))
    expect(within(dialog).getByRole('button', { name: 'Да, эмодзи совпадают' })).toBeDisabled()

    act(() => e2ee.approvals.emit([{ ...view, state: 'compare', emoji: EMOJI }]))
    expect(within(dialog).getByRole('group', { name: 'Эмодзи для сравнения' })).toHaveTextContent(
      EMOJI.join(''),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Да, эмодзи совпадают' }))
    expect(e2ee.approvals.confirm).toHaveBeenCalledWith('950')

    await user.click(within(dialog).getByRole('button', { name: 'Нет, это не я' }))
    expect(e2ee.approvals.decline).toHaveBeenCalledWith('950')

    act(() => e2ee.approvals.emit([{ ...view, state: 'done', emoji: EMOJI }]))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Новый вход' })).not.toBeInTheDocument(),
    )
  })

  it('on an approved device: closing the question only hides it here', async () => {
    const { user, e2ee } = renderApp('/', { api: withEncryptedDm() })
    await screen.findByRole('heading', { name: 'Друзья', level: 1 })
    const view = { approvalId: '950', role: 'approver' as const, deviceName: 'Телефон' }

    act(() => e2ee.approvals.emit([{ ...view, state: 'asked', emoji: null }]))
    await screen.findByRole('dialog', { name: 'Новый вход' })
    await user.keyboard('{Escape}')

    // Another device of mine may be the one to compare on: no "no" for all of them.
    expect(e2ee.approvals.dismiss).toHaveBeenCalledWith('950')
    expect(e2ee.approvals.decline).not.toHaveBeenCalled()
  })

  it('on an approved device: says so when another device answered first', async () => {
    const { user, e2ee } = renderApp('/', { api: withEncryptedDm() })
    await screen.findByRole('heading', { name: 'Друзья', level: 1 })
    const view = { approvalId: '950', role: 'approver' as const, deviceName: 'Телефон' }

    act(() => e2ee.approvals.emit([{ ...view, state: 'elsewhere', emoji: null }]))
    const dialog = await screen.findByRole('dialog', { name: 'Новый вход' })
    expect(dialog).toHaveTextContent('Уже подтверждают на другом вашем устройстве')
    await user.click(within(dialog).getByRole('button', { name: 'Понятно' }))

    expect(e2ee.approvals.dismiss).toHaveBeenCalledWith('950')
    expect(e2ee.approvals.decline).not.toHaveBeenCalled()
  })

  it('on the new device: asks another device, shows the same emoji, then gets the history', async () => {
    const { user, e2ee } = renderApp(DM_PATH, { api: withEncryptedDm() })
    e2ee.recovery.key.mockResolvedValue(null)
    const banner = await screen.findByRole('status', { name: 'Старые сообщения недоступны' })

    await user.click(
      within(banner).getByRole('button', { name: 'Подтвердить с другого устройства' }),
    )
    expect(e2ee.approvals.request).toHaveBeenCalled()
    const view = { approvalId: '950', role: 'new' as const, deviceName: null }
    act(() => e2ee.approvals.emit([{ ...view, state: 'waiting', emoji: null }]))
    expect(
      await within(banner).findByText(/нажмите «Сравнить эмодзи здесь» в окне «Новый вход»/),
    ).toBeVisible()
    // The emoji come up in a window, as on the other device.
    act(() => e2ee.approvals.emit([{ ...view, state: 'compare', emoji: EMOJI }]))
    const dialog = await screen.findByRole('dialog', { name: 'Подтверждение входа' })
    expect(within(dialog).getByRole('group', { name: 'Эмодзи для сравнения' })).toHaveTextContent(
      EMOJI.join(''),
    )
    // Here too the person compares and says yes: keys from whoever answered wait for it.
    expect(dialog).toHaveTextContent(/окна «Новый вход» там нет/)
    await user.click(within(dialog).getByRole('button', { name: 'Да, эмодзи совпадают' }))
    expect(e2ee.approvals.confirm).toHaveBeenCalledWith('950')
    act(() =>
      e2ee.approvals.emit([{ ...view, state: 'compare', emoji: EMOJI, confirmedHere: true }]),
    )
    expect(await within(dialog).findByText(/нажмите там «Да»/)).toBeVisible()
    expect(within(dialog).queryByRole('button', { name: 'Да, эмодзи совпадают' })).toBeNull()
    // Closed now, it only hides: the banner keeps saying what is left.
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Подтверждение входа' })).not.toBeInTheDocument(),
    )
    expect(within(banner).getByText(/нажмите там «Да»/)).toBeVisible()
    expect(e2ee.approvals.decline).not.toHaveBeenCalled()

    e2ee.recovery.key.mockResolvedValue(TEST_RECOVERY_KEY)
    act(() => e2ee.approvals.emit([{ ...view, state: 'done', emoji: EMOJI }]))
    await waitFor(() =>
      expect(
        screen.queryByRole('status', { name: 'Старые сообщения недоступны' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('on the new device: offers only the recovery key when no other device of mine is left', async () => {
    const { e2ee } = renderApp(DM_PATH, { api: withEncryptedDm({ otherDevice: false }) })
    e2ee.recovery.key.mockResolvedValue(null)

    const banner = await screen.findByRole('status', { name: 'Старые сообщения недоступны' })
    expect(
      await within(banner).findByRole('button', { name: 'Ввести ключ восстановления' }),
    ).toBeVisible()
    await waitFor(() =>
      expect(
        within(banner).queryByRole('button', { name: 'Подтвердить с другого устройства' }),
      ).toBeNull(),
    )
  })

  it('on the new device: says no when the emoji differ, after the other device said yes', async () => {
    const { user, e2ee } = renderApp(DM_PATH, { api: withEncryptedDm() })
    e2ee.recovery.key.mockResolvedValue(null)
    await screen.findByRole('status', { name: 'Старые сообщения недоступны' })
    const view = { approvalId: '950', role: 'new' as const, deviceName: null }

    act(() =>
      e2ee.approvals.emit([{ ...view, state: 'compare', emoji: EMOJI, approvedThere: true }]),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Подтверждение входа' })
    expect(within(dialog).getByText(/На другом устройстве нажали «Да»/)).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Нет, не совпадают' }))

    expect(e2ee.approvals.decline).toHaveBeenCalledWith('950')
    expect(e2ee.approvals.confirm).not.toHaveBeenCalled()
  })

  it('on the new device: closing the emoji window before saying yes is a no', async () => {
    const { user, e2ee } = renderApp(DM_PATH, { api: withEncryptedDm() })
    e2ee.recovery.key.mockResolvedValue(null)
    await screen.findByRole('status', { name: 'Старые сообщения недоступны' })
    const view = { approvalId: '950', role: 'new' as const, deviceName: null }

    act(() => e2ee.approvals.emit([{ ...view, state: 'compare', emoji: EMOJI }]))
    await screen.findByRole('dialog', { name: 'Подтверждение входа' })
    await user.keyboard('{Escape}')

    expect(e2ee.approvals.decline).toHaveBeenCalledWith('950')
  })

  it('in another tab of the new device: the banner goes once the device is approved', async () => {
    const { gateway, e2ee } = renderApp(DM_PATH, { api: withEncryptedDm() })
    e2ee.recovery.key.mockResolvedValue(null)
    await screen.findByRole('status', { name: 'Старые сообщения недоступны' })

    // The tab that asked got the keys; this one only hears that the device is approved now.
    e2ee.recovery.key.mockResolvedValue(TEST_RECOVERY_KEY)
    act(() => gateway.emit('E2EE_DEVICES_UPDATE', { userId: testUser.id }))

    await waitFor(() =>
      expect(
        screen.queryByRole('status', { name: 'Старые сообщения недоступны' }),
      ).not.toBeInTheDocument(),
    )
  })
})
