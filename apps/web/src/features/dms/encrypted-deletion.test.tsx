import { ApiError } from '@chinchi/sdk'
import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testFriend, testGroupDm, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { PrivateChannel, Relationship } from '@chinchi/shared'

const secretDm: PrivateChannel = {
  id: '802',
  type: 'dm',
  name: null,
  ownerId: null,
  recipients: [testFriend],
  lastMessageId: null,
  encrypted: true,
}
const plainDm: PrivateChannel = { ...secretDm, id: '803', encrypted: false }
const secretGroup = (ownerId: string): PrivateChannel => ({
  ...testGroupDm,
  id: '804',
  ownerId,
  encrypted: true,
})
const since = '2026-10-01T00:00:00.000Z'

const withChannels = (channels: PrivateChannel[]) => {
  const api = createFakeApi({ user: testUser })
  api.dms.list.mockResolvedValue({ channels })
  return api
}

const deleteButton = () => screen.queryByRole('button', { name: 'Удалить беседу' })

describe('deleting an encrypted conversation', () => {
  it('asks first, then deletes it for everyone, forgets it here and goes home', async () => {
    const api = withChannels([secretDm])
    const { user, e2ee, router } = renderApp(`/channels/@me/${secretDm.id}`, { api })

    await user.click(await screen.findByRole('button', { name: 'Удалить беседу' }))
    const dialog = await screen.findByRole('dialog', { name: 'Удалить зашифрованную беседу?' })
    expect(dialog).toHaveTextContent('у всех участников')
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))

    await waitFor(() => expect(api.channels.delete).toHaveBeenCalledWith(secretDm.id))
    expect(e2ee.forgetConversation).toHaveBeenCalledWith(secretDm.id)
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('says why when the server refuses, and keeps the conversation', async () => {
    const api = withChannels([secretDm])
    api.channels.delete.mockRejectedValueOnce(
      new ApiError(403, 'MISSING_PERMISSIONS', 'Missing permissions'),
    )
    const { user, e2ee } = renderApp(`/channels/@me/${secretDm.id}`, { api })

    await user.click(await screen.findByRole('button', { name: 'Удалить беседу' }))
    const dialog = await screen.findByRole('dialog', { name: 'Удалить зашифрованную беседу?' })
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))

    expect(await within(dialog).findByRole('alert')).toBeVisible()
    expect(e2ee.forgetConversation).not.toHaveBeenCalled()
  })

  it('is offered only for encrypted conversations, and in a group only to its owner', async () => {
    const plain = renderApp(`/channels/@me/${plainDm.id}`, { api: withChannels([plainDm]) })
    expect(await screen.findByRole('textbox', { name: /^Написать/ })).toBeVisible()
    expect(deleteButton()).not.toBeInTheDocument()
    plain.unmount()

    const member = renderApp('/channels/@me/804', { api: withChannels([secretGroup('300')]) })
    expect(await screen.findByRole('button', { name: 'Покинуть группу' })).toBeVisible()
    expect(deleteButton()).not.toBeInTheDocument()
    member.unmount()

    renderApp('/channels/@me/804', { api: withChannels([secretGroup(testUser.id)]) })
    expect(await screen.findByRole('button', { name: 'Удалить беседу' })).toBeVisible()
  })

  it('tells the other side it was deleted, and forgets it on their device too', async () => {
    const { gateway, e2ee } = renderApp(`/channels/@me/${secretDm.id}`, {
      api: withChannels([secretDm]),
    })
    await screen.findByRole('button', { name: 'Удалить беседу' })

    act(() => gateway.emit('PRIVATE_CHANNEL_DELETE', { id: secretDm.id, deleted: true }))

    expect(await screen.findByText('Эту зашифрованную беседу удалили.')).toBeVisible()
    await waitFor(() => expect(e2ee.forgetConversation).toHaveBeenCalledWith(secretDm.id))
  })
})

describe('starting an encrypted conversation', () => {
  it('opens nothing when the server answers with a plain one', async () => {
    const api = createFakeApi({ user: testUser })
    const carol = { id: '300', username: 'carol', displayName: null, avatarUrl: null }
    api.relationships.list.mockResolvedValue({
      relationships: [
        { user: testFriend, type: 'friend', since },
        { user: carol, type: 'friend', since },
      ] as Relationship[],
    })
    // Asked for an encrypted group; a server against us hands back a plain one.
    api.dms.open.mockResolvedValue({ channel: { ...testGroupDm, encrypted: false } })
    const { user, router } = renderApp('/', { api })

    const sidebar = await screen.findByRole('complementary', { name: 'Личные сообщения' })
    await user.click(await within(sidebar).findByRole('button', { name: 'Создать группу' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новая группа' })
    await user.click(within(dialog).getByLabelText('Боб'))
    await user.click(within(dialog).getByLabelText('carol'))
    await user.click(within(dialog).getByRole('switch', { name: 'Зашифрованная беседа' }))
    await user.click(within(dialog).getByRole('button', { name: 'Создать группу' }))

    expect(await within(dialog).findByText(/не зашифрованную/)).toBeVisible()
    expect(router.state.location.pathname).toBe('/')
  })
})
