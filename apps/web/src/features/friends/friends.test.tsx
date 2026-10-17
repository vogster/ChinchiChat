import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { apiError, createFakeApi, testDm, testFriend, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { Relationship } from '@chinchi/shared'

const since = '2026-10-14T12:00:00.000Z'
const carol = { id: '300', username: 'carol', displayName: null, avatarUrl: null }
const dave = { id: '400', username: 'dave', displayName: null, avatarUrl: null }
const erin = { id: '500', username: 'erin', displayName: null, avatarUrl: null }

const withRelationships = (relationships: Relationship[]) => {
  const api = createFakeApi({ user: testUser })
  api.relationships.list.mockResolvedValue({ relationships })
  return api
}

const tab = (name: string | RegExp) => screen.findByRole('tab', { name })

describe('incoming friend requests', () => {
  it('are counted on Friends, the pending tab and the home button, live', async () => {
    const api = withRelationships([{ user: carol, type: 'pending_in', since }])
    const { gateway } = renderApp('/', { api })

    const nav = await screen.findByRole('navigation', { name: 'Личные сообщения' })
    expect(
      await within(nav).findByRole('link', { name: 'Друзья (запросов в друзья: 1)' }),
    ).toBeVisible()
    expect(await tab('Ожидание (запросов в друзья: 1)')).toBeVisible()
    expect(screen.getByRole('link', { name: /^Главная.*запросов в друзья: 1/ })).toBeVisible()

    act(() => gateway.emit('RELATIONSHIP_ADD', { user: dave, type: 'pending_in', since }))
    expect(
      await within(nav).findByRole('link', { name: 'Друзья (запросов в друзья: 2)' }),
    ).toBeVisible()

    act(() => gateway.emit('RELATIONSHIP_REMOVE', { userId: carol.id }))
    act(() => gateway.emit('RELATIONSHIP_REMOVE', { userId: dave.id }))
    expect(await within(nav).findByRole('link', { name: 'Друзья' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Ожидание' })).toBeVisible()
  })

  it('leaves out requests I sent', async () => {
    renderApp('/', { api: withRelationships([{ user: erin, type: 'pending_out', since }]) })
    const nav = await screen.findByRole('navigation', { name: 'Личные сообщения' })
    expect(await within(nav).findByRole('link', { name: 'Друзья' })).toBeVisible()
  })
})

describe('friends page', () => {
  it('lists friends, online ones first by default', async () => {
    const api = withRelationships([
      { user: testFriend, type: 'friend', since },
      { user: carol, type: 'friend', since },
    ])
    const { user, gateway } = renderApp('/', { api })
    await screen.findByRole('heading', { name: 'Друзья', level: 1 })
    gateway.emit('PRESENCE_UPDATE', { userId: testFriend.id, status: 'online' })

    const list = await screen.findByRole('list', { name: 'В сети' })
    expect(await within(list).findByText('Боб')).toBeVisible()
    expect(within(list).queryByText('carol')).not.toBeInTheDocument()

    await user.click(await tab('Все'))
    const all = await screen.findByRole('list', { name: 'Все' })
    expect(within(all).getByText('Боб')).toBeVisible()
    expect(within(all).getByText('carol')).toBeVisible()
  })

  it('accepts, declines and cancels requests', async () => {
    const api = withRelationships([
      { user: carol, type: 'pending_in', since },
      { user: dave, type: 'pending_in', since },
      { user: erin, type: 'pending_out', since },
    ])
    const { user } = renderApp('/', { api })

    await user.click(await tab(/^Ожидание/))
    await user.click(await screen.findByRole('button', { name: 'Принять — carol' }))
    await user.click(screen.getByRole('button', { name: 'Отклонить — dave' }))
    await user.click(screen.getByRole('button', { name: 'Отменить — erin' }))

    expect(api.relationships.accept).toHaveBeenCalledWith(carol.id)
    expect(api.relationships.remove).toHaveBeenCalledWith(dave.id)
    expect(api.relationships.remove).toHaveBeenCalledWith(erin.id)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Отклонить — dave' })).not.toBeInTheDocument(),
    )
  })

  it('blocks friends and people asking to be friends', async () => {
    const api = withRelationships([
      { user: testFriend, type: 'friend', since },
      { user: carol, type: 'pending_in', since },
    ])
    const { user } = renderApp('/', { api })

    await user.click(await tab('Все'))
    await user.click(await screen.findByRole('button', { name: 'Заблокировать — Боб' }))
    await user.click(await tab(/^Ожидание/))
    await user.click(await screen.findByRole('button', { name: 'Заблокировать — carol' }))

    expect(api.relationships.block).toHaveBeenCalledWith(testFriend.id)
    expect(api.relationships.block).toHaveBeenCalledWith(carol.id)
  })

  it('unblocks people', async () => {
    const api = withRelationships([{ user: dave, type: 'blocked', since }])
    const { user } = renderApp('/', { api })

    await user.click(await tab('Заблокированные'))
    await user.click(await screen.findByRole('button', { name: 'Разблокировать — dave' }))

    expect(api.relationships.remove).toHaveBeenCalledWith(dave.id)
    expect(await screen.findByText('Вы никого не заблокировали')).toBeVisible()
  })

  it('sends a friend request by username', async () => {
    const api = withRelationships([])
    const { user } = renderApp('/', { api })

    await user.click(await tab('Добавить в друзья'))
    await user.type(screen.getByLabelText('Имя пользователя', { exact: true }), 'dave')
    await user.click(screen.getByRole('button', { name: 'Отправить заявку' }))

    expect(api.relationships.request).toHaveBeenCalledWith('dave')
    expect(await screen.findByText('Заявка отправлена: dave')).toBeVisible()

    api.relationships.request.mockRejectedValueOnce(apiError(400, 'FRIEND_REQUEST_FAILED'))
    await user.type(screen.getByLabelText('Имя пользователя', { exact: true }), 'nobody')
    await user.click(screen.getByRole('button', { name: 'Отправить заявку' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось отправить заявку')
  })

  it('opens a DM with a friend', async () => {
    const api = withRelationships([{ user: testFriend, type: 'friend', since }])
    const { user, router } = renderApp('/', { api })

    await user.click(await tab('Все'))
    await user.click(await screen.findByRole('button', { name: 'Написать — Боб' }))

    expect(api.dms.open).toHaveBeenCalledWith([testFriend.id])
    await waitFor(() => expect(router.state.location.pathname).toBe(`/channels/@me/${testDm.id}`))
  })

  it('keeps the list in step with the gateway', async () => {
    const api = withRelationships([])
    const { user, gateway } = renderApp('/', { api })
    await user.click(await tab(/^Ожидание/))
    await screen.findByText('Нет заявок')

    gateway.emit('RELATIONSHIP_ADD', { user: carol, type: 'pending_in', since })

    expect(await screen.findByRole('button', { name: 'Принять — carol' })).toBeVisible()
  })
})
