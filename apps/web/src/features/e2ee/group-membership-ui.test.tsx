import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testFriend, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { PrivateChannel, PublicUser } from '@chinchi/shared'

const dan: PublicUser = { id: '104', username: 'dan', displayName: 'Дэн', avatarUrl: null }
const mallory: PublicUser = {
  id: '109',
  username: 'mallory',
  displayName: 'Мэллори',
  avatarUrl: null,
}
const group: PrivateChannel = {
  id: '803',
  type: 'group_dm',
  name: null,
  ownerId: testUser.id,
  recipients: [testFriend, dan, mallory],
  lastMessageId: null,
  encrypted: true,
}
const URL_PATH = `/channels/@me/${group.id}`

const withGroup = () => {
  const api = createFakeApi({ user: testUser })
  api.dms.list.mockResolvedValue({ channels: [group] })
  return api
}

describe('who is in an encrypted group', () => {
  it('tells who added whom, to compare codes with, and who is not in the encryption yet', async () => {
    const { e2ee, user } = renderApp(URL_PATH, { api: withGroup() })
    e2ee.membership.mockResolvedValue({
      notices: [{ id: 'n1', byUserId: testFriend.id, userIds: [dan.id] }],
      pending: [mallory.id],
    })

    const notice = await screen.findByRole('status', { name: 'Новые участники беседы' })
    expect(notice).toHaveTextContent('Дэн')
    expect(notice).toHaveTextContent(`Кто добавил: ${testFriend.displayName}`)
    const waiting = screen.getByRole('status', { name: 'Ещё не в зашифрованной беседе' })
    expect(waiting).toHaveTextContent('Мэллори')

    await user.click(within(notice).getByRole('button', { name: 'Сверить код' }))
    expect(await screen.findByRole('dialog', { name: 'Проверка шифрования' })).toBeVisible()
    await user.keyboard('{Escape}')
    await user.click(within(notice).getByRole('button', { name: 'Понятно' }))
    await waitFor(() => expect(e2ee.dismissNotice).toHaveBeenCalledWith(group.id, 'n1'))
  })

  it('lets a member take in someone nobody here added, warning when not to', async () => {
    const { e2ee, user } = renderApp(URL_PATH, { api: withGroup() })
    e2ee.membership.mockResolvedValue({ notices: [], pending: [mallory.id] })

    const waiting = await screen.findByRole('status', { name: 'Ещё не в зашифрованной беседе' })
    expect(waiting).toHaveTextContent('в участники их мог вписать сервер')
    await user.click(
      within(waiting).getByRole('button', { name: 'Добавить в шифрование: Мэллори' }),
    )

    await waitFor(() => expect(e2ee.invited).toHaveBeenCalledWith(group.id, [mallory.id]))
    // The conversation opens again at once, so the device is added now.
    await waitFor(() => expect(e2ee.open.mock.calls.length).toBeGreaterThan(1))
  })

  it('says so when taking someone in fails, naming each person when there are several', async () => {
    const { e2ee, user } = renderApp(URL_PATH, { api: withGroup() })
    e2ee.membership.mockResolvedValue({ notices: [], pending: [dan.id, mallory.id] })
    e2ee.invited.mockRejectedValue(new Error('offline'))

    const waiting = await screen.findByRole('status', { name: 'Ещё не в зашифрованной беседе' })
    const takeIn = within(waiting).getByRole('button', { name: 'Добавить в шифрование: Дэн' })
    expect(takeIn).toHaveTextContent('Добавить в шифрование: Дэн')
    await user.click(takeIn)

    expect(await within(waiting).findByRole('alert')).toBeVisible()
    expect(takeIn).toBeEnabled()
  })

  it('remembers the people added from here: this device takes them in', async () => {
    const api = withGroup()
    const erin = { id: '110', username: 'erin', displayName: null, avatarUrl: null }
    api.relationships.list.mockResolvedValue({
      relationships: [{ user: erin, type: 'friend', since: '2026-10-01T00:00:00.000Z' }],
    })
    const { e2ee, user } = renderApp(URL_PATH, { api })

    await user.click(await screen.findByRole('button', { name: 'Добавить друзей' }))
    const dialog = await screen.findByRole('dialog', { name: 'Добавить в группу' })
    await user.click(await within(dialog).findByLabelText('erin'))
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))

    await waitFor(() => expect(e2ee.invited).toHaveBeenCalledWith(group.id, [erin.id]))
  })
})
