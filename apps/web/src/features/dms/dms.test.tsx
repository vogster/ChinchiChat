import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  createFakeApi,
  testDm,
  testGuild,
  testFriend,
  testGroupDm,
  testMessage,
  testUser,
} from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { PublicUser, Relationship } from '@chinchi/shared'

const since = '2026-10-14T12:00:00.000Z'
const carol = { id: '300', username: 'carol', displayName: null, avatarUrl: null }
const dave = { id: '400', username: 'dave', displayName: null, avatarUrl: null }
const DM_URL = `/channels/@me/${testDm.id}`
const GROUP_URL = `/channels/@me/${testGroupDm.id}`

const withFriends = (relationships: Relationship[] = []) => {
  const api = createFakeApi({ user: testUser })
  api.relationships.list.mockResolvedValue({ relationships })
  return api
}

const sidebar = () => screen.findByRole('complementary', { name: 'Личные сообщения' })

describe('DM sidebar', () => {
  it('lists DMs with unread state and opens them', async () => {
    const { user, router, gateway } = renderApp('/', { api: withFriends() })
    const nav = await sidebar()
    gateway.emit('READY', {
      sessionId: 's',
      user: testUser,
      guilds: [],
      privateChannels: [testDm, testGroupDm],
      voiceStates: [],
      presences: [],
      readStates: [{ channelId: testDm.id, lastReadMessageId: '1001' }],
      notificationSettings: [],
      mentionCounts: { [testDm.id]: 2 },
    })

    expect(await within(nav).findByRole('link', { name: 'Друзья' })).toBeVisible()
    const link = await within(nav).findByRole('link', {
      name: 'Боб (есть непрочитанные, упоминаний: 2)',
    })
    expect(within(nav).getByRole('link', { name: 'Боб, carol' })).toBeVisible()

    await user.click(link)

    await waitFor(() => expect(router.state.location.pathname).toBe(DM_URL))
    expect(await screen.findByRole('heading', { name: 'Боб', level: 1 })).toBeVisible()
  })

  it('counts unread DMs on the home button while you are on a server', async () => {
    const { gateway } = renderApp(`/channels/${testGuild.id}/503`, { api: withFriends() })
    await screen.findByText('Как дела?')
    gateway.emit('READY', {
      sessionId: 's',
      user: testUser,
      guilds: [],
      privateChannels: [testDm, testGroupDm],
      voiceStates: [],
      presences: [],
      readStates: [],
      notificationSettings: [],
      mentionCounts: { [testDm.id]: 2, [testGroupDm.id]: 1 },
    })

    expect(
      await screen.findByRole('link', { name: 'Главная (непрочитанных в личных сообщениях: 3)' }),
    ).toBeVisible()
  })

  it('shows notes about who joined, left and renamed a group', async () => {
    const api = withFriends()
    const note = (id: string, author: PublicUser, system: object) =>
      testMessage(id, {
        channelId: testGroupDm.id,
        guildId: null,
        author,
        content: '',
        system: system as never,
      })
    api.messages.list.mockResolvedValue({
      messages: [
        note('2001', testFriend, { kind: 'recipient_add', target: carol, name: null }),
        note('2002', testFriend, { kind: 'rename', target: null, name: 'Котики' }),
        note('2003', carol, { kind: 'leave', target: null, name: null }),
      ],
    })
    renderApp(GROUP_URL, { api })

    expect(await screen.findByText('Боб добавил(а) carol в группу')).toBeVisible()
    expect(screen.getByText('Боб переименовал(а) группу: «Котики»')).toBeVisible()
    expect(screen.getByText('carol покинул(а) группу')).toBeVisible()
  })

  it('starts a group with friends', async () => {
    const api = withFriends([
      { user: testFriend, type: 'friend', since },
      { user: carol, type: 'friend', since },
      { user: dave, type: 'pending_in', since },
    ])
    const { user, router } = renderApp('/', { api })

    await user.click(await within(await sidebar()).findByRole('button', { name: 'Создать группу' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новая группа' })
    expect(within(dialog).queryByLabelText('dave')).not.toBeInTheDocument()
    await user.click(await within(dialog).findByLabelText('Боб'))
    await user.click(within(dialog).getByLabelText('carol'))
    await user.click(within(dialog).getByRole('button', { name: 'Создать группу' }))

    expect(api.dms.open).toHaveBeenCalledWith([testFriend.id, carol.id])
    await waitFor(() => expect(router.state.location.pathname).toBe(GROUP_URL))
  })
})

describe('DM view', () => {
  it('shows the conversation and sends to it', async () => {
    const api = withFriends()
    const { user } = renderApp(DM_URL, { api })

    expect(await screen.findByText('Это начало вашей переписки с Боб.')).toBeVisible()
    expect(await screen.findByText('Привет всем!')).toBeVisible()
    await user.type(screen.getByRole('textbox', { name: 'Написать @Боб' }), 'привет{Enter}')

    await waitFor(() =>
      expect(api.messages.create).toHaveBeenCalledWith(
        testDm.id,
        expect.objectContaining({ content: 'привет' }),
      ),
    )
  })

  it('replaces the composer when the other person is blocked', async () => {
    const api = withFriends([{ user: testFriend, type: 'blocked', since }])
    renderApp(DM_URL, { api })

    expect(await screen.findByText(/Вы заблокировали этого пользователя/)).toBeVisible()
    expect(screen.queryByRole('textbox', { name: 'Написать @Боб' })).not.toBeInTheDocument()
  })

  it('explains a DM that is not there', async () => {
    renderApp('/channels/@me/999', { api: withFriends() })

    expect(await screen.findByText('Переписка не найдена')).toBeVisible()
  })
})

describe('group DMs', () => {
  it('renames the group', async () => {
    const api = withFriends()
    const { user } = renderApp(GROUP_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Переименовать группу' }))
    const dialog = await screen.findByRole('dialog', { name: 'Переименовать группу' })
    await user.type(within(dialog).getByLabelText('Название группы', { exact: true }), 'Котики')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    expect(api.dms.rename).toHaveBeenCalledWith(testGroupDm.id, 'Котики')
    expect(await screen.findByRole('heading', { name: 'Котики', level: 1 })).toBeVisible()
  })

  it('adds friends who are not in it yet', async () => {
    const api = withFriends([
      { user: testFriend, type: 'friend', since },
      { user: dave, type: 'friend', since },
    ])
    const { user } = renderApp(GROUP_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Добавить друзей' }))
    const dialog = await screen.findByRole('dialog', { name: 'Добавить в группу' })
    expect(within(dialog).queryByLabelText('Боб')).not.toBeInTheDocument()
    await user.click(await within(dialog).findByLabelText('dave'))
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))

    await waitFor(() => expect(api.dms.addRecipient).toHaveBeenCalledWith(testGroupDm.id, dave.id))
  })

  it('lets the owner remove people and anyone leave', async () => {
    const api = withFriends()
    const { user, router } = renderApp(GROUP_URL, { api })

    const members = await screen.findByRole('complementary', { name: 'Участники' })
    expect(within(members).getByText('alice')).toBeVisible()
    await user.click(within(members).getByRole('button', { name: 'Исключить — carol' }))
    expect(api.dms.removeRecipient).toHaveBeenCalledWith(testGroupDm.id, carol.id)

    await user.click(screen.getByRole('button', { name: 'Покинуть группу' }))
    const dialog = await screen.findByRole('dialog', { name: 'Покинуть группу' })
    await user.click(within(dialog).getByRole('button', { name: 'Покинуть группу' }))

    expect(api.dms.removeRecipient).toHaveBeenCalledWith(testGroupDm.id, testUser.id)
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})
