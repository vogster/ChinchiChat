import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testDm, testFriend, testUser } from '../../test/fake-api'
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

const withDms = () => {
  const api = createFakeApi({ user: testUser })
  api.dms.list.mockResolvedValue({ channels: [testDm, encryptedDm] })
  return api
}

describe('search in encrypted conversations', () => {
  it('searches on this device and lists what it found', async () => {
    const { user, e2ee } = renderApp(`/channels/@me/${encryptedDm.id}`, { api: withDms() })
    e2ee.search.mockResolvedValue([
      { id: '104331612484796416', authorId: testFriend.id, text: 'Встреча переносится' },
    ])

    await user.type(await screen.findByRole('searchbox', { name: 'Поиск' }), 'встреча{Enter}')

    const results = await screen.findByRole('complementary', { name: 'Результаты поиска' })
    expect(await within(results).findByText('Встреча переносится')).toBeVisible()
    expect(within(results).getByText('Боб')).toBeVisible()
    expect(within(results).getByText(/только на этом устройстве/)).toBeVisible()
    expect(e2ee.search).toHaveBeenCalledWith(
      expect.objectContaining({ id: encryptedDm.id }),
      'встреча',
    )

    await user.click(within(results).getByRole('button', { name: 'Закрыть поиск' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: 'Результаты поиска' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('is not offered in plain DMs (they have no search yet)', async () => {
    renderApp(`/channels/@me/${testDm.id}`, { api: withDms() })
    await screen.findByRole('textbox', { name: 'Написать @Боб' })

    expect(screen.queryByRole('searchbox', { name: 'Поиск' })).not.toBeInTheDocument()
  })
})
