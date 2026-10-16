import { Permission } from '@chinchi/shared'
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testFriend, testGuild, testMembers, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { AuditLogEntry, Ban } from '@chinchi/shared'

const GENERAL_URL = `/channels/${testGuild.id}/503`
const inTenMinutes = () => new Date(Date.now() + 10 * 60_000).toISOString()

const openBobCard = async (user: ReturnType<typeof renderApp>['user']) => {
  const members = await screen.findByRole('complementary', { name: /Участники/ })
  await user.click(await within(members).findByRole('button', { name: /^Боб,/ }))
  return screen.findByRole('dialog', { name: 'Профиль: Боб' })
}

describe('moderating from a profile card', () => {
  it('times a member out for a chosen while, with a reason', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(GENERAL_URL, { api })

    await user.click(within(await openBobCard(user)).getByRole('button', { name: 'Тайм-аут' }))
    const dialog = await screen.findByRole('dialog', { name: 'Тайм-аут: Боб' })
    await user.click(within(dialog).getByRole('radio', { name: '10 минут' }))
    await user.type(within(dialog).getByLabelText('Причина', { exact: true }), 'остынь')
    await user.click(within(dialog).getByRole('button', { name: 'Отправить в тайм-аут' }))

    await waitFor(() =>
      expect(api.moderation.timeout).toHaveBeenCalledWith(testGuild.id, testFriend.id, {
        until: expect.any(String),
        reason: 'остынь',
      }),
    )
    const until = Date.parse(api.moderation.timeout.mock.calls[0]?.[2].until as string)
    expect(until - Date.now()).toBeGreaterThan(9 * 60_000)
    expect(until - Date.now()).toBeLessThanOrEqual(10 * 60_000)
  })

  it('kicks and bans after confirming, the ban optionally clearing recent messages', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(GENERAL_URL, { api })

    await user.click(within(await openBobCard(user)).getByRole('button', { name: 'Выгнать' }))
    const kick = await screen.findByRole('dialog', { name: 'Выгнать: Боб' })
    await user.type(within(kick).getByLabelText('Причина', { exact: true }), 'флуд')
    await user.click(within(kick).getByRole('button', { name: 'Выгнать' }))
    await waitFor(() =>
      expect(api.moderation.kick).toHaveBeenCalledWith(testGuild.id, testFriend.id, 'флуд'),
    )

    await user.click(within(await openBobCard(user)).getByRole('button', { name: 'Забанить' }))
    const ban = await screen.findByRole('dialog', { name: 'Забанить: Боб' })
    await user.selectOptions(
      within(ban).getByLabelText('Удалить сообщения', { exact: true }),
      '3600',
    )
    await user.click(within(ban).getByRole('button', { name: 'Забанить' }))
    await waitFor(() =>
      expect(api.moderation.ban).toHaveBeenCalledWith(testGuild.id, testFriend.id, {
        deleteMessageSeconds: 3600,
      }),
    )
  })

  it('lifts a running timeout', async () => {
    const api = createFakeApi({ user: testUser })
    const timedOut = testMembers.map((m) =>
      m.user.id === testFriend.id ? { ...m, timeoutUntil: inTenMinutes() } : m,
    )
    api.guilds.members.mockResolvedValue({ members: timedOut })
    const { user } = renderApp(GENERAL_URL, { api })

    const card = await openBobCard(user)
    await user.click(await within(card).findByRole('button', { name: 'Снять тайм-аут' }))

    expect(api.moderation.timeout).toHaveBeenCalledWith(testGuild.id, testFriend.id, {
      until: null,
    })
  })

  it('treats a timeout that has run out as over', async () => {
    const api = createFakeApi({ user: testUser })
    const ended = new Date(Date.now() - 60_000).toISOString()
    api.guilds.members.mockResolvedValue({
      members: testMembers.map((m) =>
        m.user.id === testFriend.id ? { ...m, timeoutUntil: ended } : m,
      ),
    })
    const { user } = renderApp(GENERAL_URL, { api })

    const card = await openBobCard(user)
    expect(await within(card).findByRole('button', { name: 'Тайм-аут' })).toBeVisible()
    expect(within(card).queryByRole('button', { name: 'Снять тайм-аут' })).not.toBeInTheDocument()
  })

  it('offers no timeout for administrators, whom it would not affect', async () => {
    const api = createFakeApi({ user: testUser })
    const roles = testGuild.roles.map((role) =>
      role.id === '510' ? { ...role, permissions: Permission.Administrator.toString() } : role,
    )
    api.guilds.get.mockResolvedValue({ guild: { ...testGuild, roles } })
    const { user } = renderApp(GENERAL_URL, { api })

    const card = await openBobCard(user)
    await within(card).findByRole('button', { name: 'Выгнать' })
    expect(within(card).queryByRole('button', { name: 'Тайм-аут' })).not.toBeInTheDocument()
  })

  it('offers no moderation to members without those rights', async () => {
    const api = createFakeApi({ user: testUser })
    api.guilds.get.mockResolvedValue({ guild: { ...testGuild, ownerId: '999' } })
    const { user } = renderApp(GENERAL_URL, { api })

    const card = await openBobCard(user)
    await within(card).findByRole('button', { name: 'Написать' })
    expect(within(card).queryByRole('button', { name: 'Выгнать' })).not.toBeInTheDocument()
  })
})

describe('being timed out', () => {
  it('replaces the composer with when the timeout ends', async () => {
    // Owners can't be timed out: the server belongs to someone else here.
    const api = createFakeApi({ user: testUser })
    api.guilds.get.mockResolvedValue({ guild: { ...testGuild, ownerId: '999' } })
    const { gateway } = renderApp(GENERAL_URL, { api })
    await screen.findByRole('list', { name: 'Сообщения в #общий' })
    gateway.emit('GUILD_MEMBER_UPDATE', {
      guildId: testGuild.id,
      userId: testUser.id,
      roleIds: [],
      nickname: null,
      timeoutUntil: inTenMinutes(),
    })

    expect(await screen.findByText(/Вы в тайм-ауте до/)).toBeVisible()
    expect(screen.queryByRole('textbox', { name: 'Сообщение в #общий' })).not.toBeInTheDocument()
  })

  it('gives the composer back once the timeout runs out', async () => {
    const api = createFakeApi({ user: testUser })
    api.guilds.get.mockResolvedValue({ guild: { ...testGuild, ownerId: '999' } })
    const { gateway } = renderApp(GENERAL_URL, { api })
    await screen.findByRole('list', { name: 'Сообщения в #общий' })
    gateway.emit('GUILD_MEMBER_UPDATE', {
      guildId: testGuild.id,
      userId: testUser.id,
      roleIds: [],
      nickname: null,
      timeoutUntil: new Date(Date.now() + 1000).toISOString(),
    })

    expect(await screen.findByText(/Вы в тайм-ауте до/)).toBeVisible()
    expect(
      await screen.findByRole('textbox', { name: 'Сообщение в #общий' }, { timeout: 4000 }),
    ).toBeVisible()
  })
})

describe('server settings', () => {
  it('lists bans and lifts them', async () => {
    const api = createFakeApi({ user: testUser })
    const ban: Ban = { user: testFriend, reason: 'спам', createdAt: '2026-10-14T12:00:00.000Z' }
    api.moderation.bans.mockResolvedValueOnce({ bans: [ban] }).mockResolvedValue({ bans: [] })
    const { user } = renderApp(`/server-settings/${testGuild.id}/bans`, { api })

    expect(await screen.findByText('спам')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Разбанить — Боб' }))

    expect(api.moderation.unban).toHaveBeenCalledWith(testGuild.id, testFriend.id)
    expect(await screen.findByText('Никто не забанен')).toBeVisible()
  })

  it('shows the audit log with who did what to whom and why', async () => {
    const api = createFakeApi({ user: testUser })
    const entry: AuditLogEntry = {
      id: '900',
      action: 'member_kick',
      actor: { id: testUser.id, username: 'alice', displayName: null, avatarUrl: null },
      targetUser: testFriend,
      targetId: null,
      reason: 'флуд',
      data: {},
      createdAt: '2026-10-14T12:00:00.000Z',
    }
    api.moderation.auditLog.mockResolvedValue({ entries: [entry] })
    renderApp(`/server-settings/${testGuild.id}/audit-log`, { api })

    const log = await screen.findByRole('list', { name: 'Журнал действий' })
    expect(await within(log).findByText(/alice выгнал\(а\) Боб/)).toBeVisible()
    expect(within(log).getByText('флуд')).toBeVisible()
  })
})
