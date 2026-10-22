import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testDm, testFriend, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { Relationship } from '@chinchi/shared'

const since = '2026-10-14T12:00:00.000Z'
const carol = { id: '300', username: 'carol', displayName: null, avatarUrl: null }

const withFriends = () => {
  const api = createFakeApi({ user: testUser })
  const relationships: Relationship[] = [
    { user: testFriend, type: 'friend', since },
    { user: carol, type: 'friend', since },
  ]
  api.relationships.list.mockResolvedValue({ relationships })
  return api
}

describe('friends page', () => {
  it('finds friends by name', async () => {
    const { user } = renderApp('/', { api: withFriends() })
    await user.click(await screen.findByRole('tab', { name: 'Все' }))
    const list = await screen.findByRole('list', { name: 'Все' })
    expect(within(list).getByText('carol')).toBeVisible()

    await user.type(screen.getByRole('searchbox', { name: 'Поиск друзей' }), 'бо')

    expect(within(list).getByText('Боб')).toBeVisible()
    expect(within(list).queryByText('carol')).not.toBeInTheDocument()
  })

  it('shows friends as cards or as a list', async () => {
    const { user } = renderApp('/', { api: withFriends() })
    await user.click(await screen.findByRole('tab', { name: 'Все' }))
    const list = await screen.findByRole('list', { name: 'Все' })
    expect(list).toHaveAttribute('data-layout', 'grid')

    await user.click(screen.getByRole('button', { name: 'Списком' }))
    expect(screen.getByRole('list', { name: 'Все' })).toHaveAttribute('data-layout', 'list')
    expect(screen.getByRole('button', { name: 'Списком' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('starts a secret chat with a friend', async () => {
    const api = withFriends()
    const { user } = renderApp('/', { api })
    await user.click(await screen.findByRole('tab', { name: 'Все' }))

    await user.click(await screen.findByRole('button', { name: 'Секретный чат — Боб' }))

    expect(api.dms.open).toHaveBeenCalledWith([testFriend.id], { encrypted: true })
  })

  it('says so when the server answers a secret chat with a plain one', async () => {
    const api = withFriends()
    api.dms.open.mockResolvedValue({ channel: { ...testDm, encrypted: false } })
    const { user, router } = renderApp('/', { api })
    await user.click(await screen.findByRole('tab', { name: 'Все' }))

    await user.click(await screen.findByRole('button', { name: 'Секретный чат — Боб' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('не зашифрованную')
    expect(router.state.location.pathname).toBe('/')
  })

  it('keeps removing and blocking behind the "more" menu', async () => {
    const api = withFriends()
    const { user } = renderApp('/', { api })
    await user.click(await screen.findByRole('tab', { name: 'Все' }))

    await user.click(await screen.findByRole('button', { name: 'Ещё — Боб' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить из друзей' }))

    expect(api.relationships.remove).toHaveBeenCalledWith(testFriend.id)
  })
})

describe('direct messages sidebar', () => {
  it('finds a conversation by name', async () => {
    const { user } = renderApp('/', { user: testUser })
    const nav = await screen.findByRole('navigation', { name: 'Личные сообщения' })
    expect(await within(nav).findByRole('link', { name: /^Боб( \(|$)/ })).toBeVisible()

    await user.type(screen.getByRole('searchbox', { name: 'Найти беседу' }), 'carol')

    expect(within(nav).queryByRole('link', { name: /^Боб( \(|$)/ })).not.toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /carol/ })).toBeVisible()
  })
})
