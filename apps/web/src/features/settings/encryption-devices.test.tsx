import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { Device } from '@chinchi/shared'

const device = (id: string, name: string, revokedAt: string | null = null): Device => ({
  id,
  userId: testUser.id,
  name,
  signaturePublicKey: 'a2V5',
  createdAt: '2026-10-01T10:00:00.000Z',
  revokedAt,
  userSignature: null,
})

describe('encryption devices in settings', () => {
  it('lists my devices, marks this one, and removes another', async () => {
    const api = createFakeApi({ user: testUser })
    // The fake e2ee client says this browser is device 700.
    api.e2ee.myDevices.mockResolvedValue({
      devices: [
        device('700', 'Chrome на Windows'),
        device('701', 'Чужой ноутбук'),
        device('702', 'Старый телефон', '2026-10-05T10:00:00.000Z'),
      ],
    })
    const { user } = renderApp('/settings/sessions', { api })

    const list = await screen.findByRole('list', { name: 'Ключи шифрования' })
    const here = await within(list).findByRole('listitem', { name: 'Chrome на Windows' })
    expect(await within(here).findByText('Это устройство')).toBeVisible()
    expect(within(here).queryByRole('button')).not.toBeInTheDocument()
    expect(within(list).queryByText('Старый телефон')).not.toBeInTheDocument()

    api.e2ee.myDevices.mockResolvedValue({ devices: [device('700', 'Chrome на Windows')] })
    await user.click(
      within(list).getByRole('button', { name: 'Удалить ключи устройства Чужой ноутбук' }),
    )

    expect(api.e2ee.deleteDevice).toHaveBeenCalledWith('701')
    await waitFor(() => expect(within(list).queryByText('Чужой ноутбук')).not.toBeInTheDocument())
  })

  it('turns strict mode on for this browser', async () => {
    const api = createFakeApi({ user: testUser })
    api.e2ee.myDevices.mockResolvedValue({ devices: [device('700', 'Chrome на Windows')] })
    const { user, e2ee } = renderApp('/settings/sessions', { api })

    const toggle = await screen.findByRole('switch', { name: 'Только подтверждённые устройства' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(toggle).toHaveAccessibleDescription(/Сообщения шифруются только для устройств/)
    e2ee.strict.enabled.mockResolvedValue(true)
    await user.click(toggle)

    expect(e2ee.strict.set).toHaveBeenCalledWith(true)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
  })
})
