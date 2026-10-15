import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testDm, testGuild, testProfile, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const GENERAL_URL = `/channels/${testGuild.id}/503`

const card = (name: string) => screen.findByRole('dialog', { name: `Профиль: ${name}` })

describe('profile card', () => {
  it('opens from a message author, with bio, roles and what you share', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(GENERAL_URL, { api })

    const history = await screen.findByRole('list', { name: 'Сообщения в #общий' })
    await user.click(
      (await within(history).findAllByRole('button', { name: 'Боб' }))[0] as HTMLElement,
    )

    const profile = await card('Боб')
    expect(api.users.profile).toHaveBeenCalledWith('200', testGuild.id)
    expect(await within(profile).findByText('Строю плотины 🦫')).toBeVisible()
    expect(within(profile).getByText('bob')).toBeVisible()
    expect(within(profile).getByText('Модераторы')).toBeVisible()
    expect(within(profile).getByText('Котики')).toBeVisible()
  })

  it('tops the card with their banner, or their colour without one', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(GENERAL_URL, { api })
    const members = await screen.findByRole('complementary', { name: /Участники/ })

    await user.click(await within(members).findByRole('button', { name: /^Боб,/ }))
    const banner = within(await card('Боб')).getByTestId('profile-banner')
    expect(banner).toHaveStyle({ backgroundColor: '#2b8a3e' })
    expect(banner.querySelector('img')).toBeNull()
  })

  it('shows a banner picture when they have one', async () => {
    const api = createFakeApi({ user: testUser })
    api.users.profile.mockImplementation(async (userId: string) => ({
      profile: { ...testProfile(userId), bannerUrl: '/api/v1/banners/200/1.webp' },
    }))
    const { user } = renderApp(GENERAL_URL, { api })
    const members = await screen.findByRole('complementary', { name: /Участники/ })

    await user.click(await within(members).findByRole('button', { name: /^Боб,/ }))
    const banner = within(await card('Боб')).getByTestId('profile-banner')
    expect(banner.querySelector('img')).toHaveAttribute('src', '/api/v1/banners/200/1.webp')
  })

  it('opens from the member list and messages them', async () => {
    const api = createFakeApi({ user: testUser })
    const { user, router } = renderApp(GENERAL_URL, { api })

    const members = await screen.findByRole('complementary', { name: /Участники/ })
    await user.click(await within(members).findByRole('button', { name: /^Боб,/ }))
    await user.click(await within(await card('Боб')).findByRole('button', { name: 'Написать' }))

    expect(api.dms.open).toHaveBeenCalledWith(['200'])
    await waitFor(() => expect(router.state.location.pathname).toBe(`/channels/@me/${testDm.id}`))
  })

  it('offers to add strangers as friends, and to block them', async () => {
    const api = createFakeApi({ user: testUser })
    api.users.profile.mockImplementation(async (userId: string) => ({
      profile: {
        user: { id: userId, username: 'bob', displayName: 'Боб', avatarUrl: null },
        bio: null,
        createdAt: '2026-01-15T12:00:00.000Z',
        bannerUrl: null,
        accentColor: null,
        relationship: null,
        mutualGuildIds: [testGuild.id],
        mutualFriends: [],
        member: null,
      },
    }))
    const { user } = renderApp(GENERAL_URL, { api })

    const members = await screen.findByRole('complementary', { name: /Участники/ })
    await user.click(await within(members).findByRole('button', { name: /^Боб,/ }))
    const profile = await card('Боб')
    await user.click(await within(profile).findByRole('button', { name: 'Добавить в друзья' }))
    expect(api.relationships.request).toHaveBeenCalledWith('bob')

    await user.click(within(profile).getByRole('button', { name: 'Заблокировать' }))
    expect(api.relationships.block).toHaveBeenCalledWith('200')
  })

  it('lets you edit your own profile and server nickname from your card', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(GENERAL_URL, { api })

    const members = await screen.findByRole('complementary', { name: /Участники/ })
    await user.click(await within(members).findByRole('button', { name: /^alice,.*владелец/i }))
    const mine = await card('alice')
    expect(within(mine).getByRole('link', { name: 'Редактировать профиль' })).toHaveAttribute(
      'href',
      '/settings/profile',
    )
    // Nobody moderates themselves, not even the owner.
    expect(within(mine).queryByRole('button', { name: 'Выгнать' })).toBeNull()
    expect(within(mine).queryByRole('button', { name: 'Забанить' })).toBeNull()

    await user.click(within(mine).getByRole('button', { name: 'Изменить никнейм' }))
    const dialog = await screen.findByRole('dialog', { name: 'Никнейм на сервере' })
    // The field is ready for typing straight away, not the close button.
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Никнейм', { exact: true })).toHaveFocus(),
    )
    await user.keyboard('Алиса К')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    expect(api.guilds.setNickname).toHaveBeenCalledWith(testGuild.id, testUser.id, 'Алиса К')
  })

  it('keeps a card open from the member list when that member moves to another group', async () => {
    const { user, gateway } = renderApp(GENERAL_URL, { api: createFakeApi({ user: testUser }) })

    const members = await screen.findByRole('complementary', { name: /Участники/ })
    await user.click(await within(members).findByRole('button', { name: /^Боб, Не в сети/ }))
    await card('Боб')

    // Coming online moves Bob from «offline» under his hoisted role.
    act(() => gateway.emit('PRESENCE_UPDATE', { userId: '200', status: 'online' }))
    expect(await within(members).findByText('Модераторы — 1')).toBeVisible()
    expect(within(members).getByRole('button', { name: /^Боб, В сети/ })).toBeVisible()
    expect(screen.getByRole('dialog', { name: 'Профиль: Боб' })).toBeVisible()
  })

  it('shows server nicknames in the member list and in messages', async () => {
    const { gateway } = renderApp(GENERAL_URL, { api: createFakeApi({ user: testUser }) })
    await screen.findByRole('list', { name: 'Сообщения в #общий' })

    gateway.emit('GUILD_MEMBER_UPDATE', {
      guildId: testGuild.id,
      userId: '200',
      roleIds: ['510'],
      nickname: 'Бобр',
      timeoutUntil: null,
    })

    const members = await screen.findByRole('complementary', { name: /Участники/ })
    expect(await within(members).findByRole('button', { name: /^Бобр,/ })).toBeVisible()
    const history = screen.getByRole('list', { name: 'Сообщения в #общий' })
    expect(
      (await within(history).findAllByRole('button', { name: 'Бобр' })).length,
    ).toBeGreaterThan(0)
  })
})
