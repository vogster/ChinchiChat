import { act, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { createFakeApi, testFriend, testUser } from '../../test/fake-api'
import { TEST_RECOVERY_KEY } from '../../test/fake-e2ee'
import { renderApp } from '../../test/render-app'

import type { PrivateChannel } from '@chinchi/shared'

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
const withEncryptedDm = () => {
  const api = createFakeApi({ user: testUser })
  api.dms.list.mockResolvedValue({ channels: [encryptedDm] })
  return api
}

describe('the recovery key', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  it('asks once to be saved, and stops asking when it is', async () => {
    const { user, e2ee } = renderApp(DM_PATH, { api: withEncryptedDm() })
    e2ee.recovery.saved.mockResolvedValue(false)
    e2ee.recovery.markSaved.mockImplementation(async () => {
      e2ee.recovery.saved.mockResolvedValue(true)
    })

    const dialog = await screen.findByRole('dialog', { name: 'Сохраните ключ восстановления' })
    expect(within(dialog).getByText(TEST_RECOVERY_KEY)).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Скачать' })).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Я сохранил ключ' }))

    expect(e2ee.recovery.markSaved).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('can wait: "later" closes it without marking it saved', async () => {
    const { user, e2ee } = renderApp(DM_PATH, { api: withEncryptedDm() })
    e2ee.recovery.saved.mockResolvedValue(false)

    const dialog = await screen.findByRole('dialog', { name: 'Сохраните ключ восстановления' })
    await user.click(within(dialog).getByRole('button', { name: 'Позже' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(e2ee.recovery.markSaved).not.toHaveBeenCalled()
  })

  it('brings old messages to a device without it, once typed in', async () => {
    const { user, e2ee } = renderApp(DM_PATH, { api: withEncryptedDm() })
    e2ee.recovery.key.mockResolvedValue(null)

    const banner = await screen.findByRole('status', { name: 'Старые сообщения недоступны' })
    await user.click(within(banner).getByRole('button', { name: 'Ввести ключ восстановления' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ключ восстановления' })
    const input = within(dialog).getByRole('textbox', { name: 'Ключ восстановления' })

    e2ee.recovery.useKey.mockResolvedValueOnce('invalid')
    await user.type(input, 'ABCD{Enter}')
    expect(await within(dialog).findByText(/не похоже на ключ восстановления/)).toBeVisible()
    e2ee.recovery.useKey.mockResolvedValueOnce('wrong')
    await user.click(within(dialog).getByRole('button', { name: 'Восстановить' }))
    expect(await within(dialog).findByText(/не подходит к этой учётной записи/)).toBeVisible()

    e2ee.recovery.key.mockResolvedValue(TEST_RECOVERY_KEY)
    await user.click(within(dialog).getByRole('button', { name: 'Восстановить' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(e2ee.recovery.useKey).toHaveBeenLastCalledWith('ABCD')
    await waitFor(() =>
      expect(
        screen.queryByRole('status', { name: 'Старые сообщения недоступны' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('without the key: hides on this device, and comes back from the chat header', async () => {
    const { user, e2ee, router } = renderApp(DM_PATH, { api: withEncryptedDm() })
    e2ee.recovery.key.mockResolvedValue(null)
    const banner = await screen.findByRole('status', { name: 'Старые сообщения недоступны' })
    const reason = { name: 'Почему старые сообщения недоступны' }
    expect(screen.queryByRole('button', reason)).not.toBeInTheDocument()

    await user.click(within(banner).getByRole('button', { name: 'Скрыть подсказку' }))
    expect(
      screen.queryByRole('status', { name: 'Старые сообщения недоступны' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', reason)).toBeVisible()

    // Remembered for this device: other visits stay quiet too.
    await router.navigate({ to: '/' })
    await screen.findByRole('heading', { name: 'Друзья', level: 1 })
    await router.navigate({ to: DM_PATH })
    expect(await screen.findByRole('button', reason)).toBeVisible()
    expect(
      screen.queryByRole('status', { name: 'Старые сообщения недоступны' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', reason))
    const back = await screen.findByRole('status', { name: 'Старые сообщения недоступны' })
    expect(within(back).getByRole('button', { name: 'Ввести ключ восстановления' })).toBeVisible()
    expect(screen.queryByRole('button', reason)).not.toBeInTheDocument()
  })

  it('stays in view while another device is asked, even when hidden before', async () => {
    const { user, e2ee } = renderApp(DM_PATH, { api: withEncryptedDm() })
    e2ee.recovery.key.mockResolvedValue(null)
    const banner = await screen.findByRole('status', { name: 'Старые сообщения недоступны' })
    await user.click(within(banner).getByRole('button', { name: 'Скрыть подсказку' }))

    act(() =>
      e2ee.approvals.emit([
        { approvalId: '950', role: 'new', deviceName: null, state: 'waiting', emoji: null },
      ]),
    )

    const asking = await screen.findByRole('status', { name: 'Старые сообщения недоступны' })
    expect(within(asking).getByText(/на другом своём устройстве/)).toBeVisible()
    expect(
      within(asking).queryByRole('button', { name: 'Скрыть подсказку' }),
    ).not.toBeInTheDocument()
  })

  it('is masked in settings until the eye shows it, and hides again', async () => {
    const { user } = renderApp('/settings/sessions', { api: withEncryptedDm() })

    const section = await screen.findByRole('region', { name: 'Ключ восстановления' })
    const eye = await within(section).findByRole('button', { name: 'Показать ключ' })
    expect(within(section).queryByText(TEST_RECOVERY_KEY)).not.toBeInTheDocument()
    expect(within(section).getByText(/^[•-]+$/)).toBeVisible()

    await user.click(eye)
    expect(within(section).getByText(TEST_RECOVERY_KEY)).toBeVisible()
    await user.click(within(section).getByRole('button', { name: 'Скрыть ключ' }))
    expect(within(section).queryByText(TEST_RECOVERY_KEY)).not.toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Скопировать' })).toBeVisible()
  })

  it('can be reset from settings, after a warning, when everything is lost', async () => {
    const { user, e2ee } = renderApp('/settings/sessions', { api: withEncryptedDm() })
    e2ee.recovery.key.mockResolvedValue(null)
    const section = await screen.findByRole('region', { name: 'Ключ восстановления' })

    await user.click(
      await within(section).findByRole('button', { name: 'Сбросить ключи шифрования' }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Сбросить ключи шифрования?' })
    expect(dialog).toHaveTextContent('собеседники увидят')
    e2ee.recovery.key.mockResolvedValue(TEST_RECOVERY_KEY)
    await user.click(within(dialog).getByRole('button', { name: 'Сбросить' }))

    expect(e2ee.recovery.reset).toHaveBeenCalled()
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Сбросить ключи шифрования?' }),
      ).not.toBeInTheDocument(),
    )
  })
})
