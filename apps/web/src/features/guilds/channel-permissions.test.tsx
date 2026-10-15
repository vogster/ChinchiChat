import { Permission } from '@chinchi/shared'
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { Channel } from '@chinchi/shared'

const MEMES_URL = `/channels/${testGuild.id}/504`
const VIEW = String(Permission.ViewChannel)
const SEND = String(Permission.SendMessages)

const openPermissions = async (user: ReturnType<typeof renderApp>['user']) => {
  await user.click(await screen.findByRole('button', { name: 'Настроить канал мемы' }))
  const dialog = await screen.findByRole('dialog', { name: 'Настройки канала' })
  await user.click(within(dialog).getByRole('tab', { name: 'Права доступа' }))
  return dialog
}

const permission = (scope: HTMLElement, name: string) =>
  within(scope).getByRole('radiogroup', { name })

describe('channel permissions', () => {
  it('hides a channel from @everyone', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(MEMES_URL, { api })
    const dialog = await openPermissions(user)

    const form = within(dialog).getByRole('form', { name: '@everyone' })
    const save = within(form).getByRole('button', { name: 'Сохранить права' })
    expect(save).toBeDisabled()
    const view = permission(form, 'Просматривать каналы')
    expect(within(view).getByRole('radio', { name: 'Как у роли' })).toBeChecked()

    await user.click(within(view).getByRole('radio', { name: 'Запретить' }))
    await user.click(save)

    await waitFor(() =>
      expect(api.permissions.put).toHaveBeenCalledWith('504', testGuild.id, {
        targetType: 'role',
        allow: '0',
        deny: VIEW,
      }),
    )
  })

  it('offers to sync a channel that drifted from its category', async () => {
    const api = createFakeApi({ user: testUser })
    const drifted = testGuild.channels.map((c) =>
      c.id === '504'
        ? {
            ...c,
            permissionOverwrites: [
              { targetType: 'role' as const, targetId: testGuild.id, allow: '0', deny: SEND },
            ],
          }
        : c,
    )
    api.guilds.get.mockResolvedValue({ guild: { ...testGuild, channels: drifted } })
    const { user } = renderApp(MEMES_URL, { api })
    const dialog = await openPermissions(user)

    expect(within(dialog).getByText(/не совпадают с категорией «Текстовые каналы»/)).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Синхронизировать' }))

    await waitFor(() => expect(api.permissions.sync).toHaveBeenCalledWith('504'))
  })

  it('says when a channel matches its category', async () => {
    const { user } = renderApp(MEMES_URL, { api: createFakeApi({ user: testUser }) })
    const dialog = await openPermissions(user)

    expect(within(dialog).getByText(/совпадают с категорией «Текстовые каналы»/)).toBeVisible()
    expect(within(dialog).queryByRole('button', { name: 'Синхронизировать' })).toBeNull()
  })

  it('adds a member and lets them write', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(MEMES_URL, { api })
    const dialog = await openPermissions(user)

    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Добавить роль или участника' }),
      'Боб',
    )
    const form = await within(dialog).findByRole('form', { name: 'Боб' })
    await user.click(
      within(permission(form, 'Отправлять сообщения')).getByRole('radio', { name: 'Разрешить' }),
    )
    await user.click(within(form).getByRole('button', { name: 'Сохранить права' }))

    await waitFor(() =>
      expect(api.permissions.put).toHaveBeenCalledWith('504', '200', {
        targetType: 'member',
        allow: SEND,
        deny: '0',
      }),
    )
  })

  it('removes an overwrite', async () => {
    const api = createFakeApi({ user: testUser })
    const memes = testGuild.channels.find((c) => c.id === '504') as Channel
    api.guilds.get.mockResolvedValue({
      guild: {
        ...testGuild,
        channels: testGuild.channels.map((c) =>
          c.id === '504'
            ? {
                ...memes,
                permissionOverwrites: [
                  { targetType: 'role' as const, targetId: '510', allow: SEND, deny: '0' },
                ],
              }
            : c,
        ),
      },
    })
    const { user } = renderApp(MEMES_URL, { api })
    const dialog = await openPermissions(user)

    await user.click(within(dialog).getByRole('button', { name: 'Модераторы' }))
    const form = within(dialog).getByRole('form', { name: 'Модераторы' })
    expect(
      within(permission(form, 'Отправлять сообщения')).getByRole('radio', { name: 'Разрешить' }),
    ).toBeChecked()
    await user.click(within(form).getByRole('button', { name: 'Сбросить права для Модераторы' }))

    await waitFor(() => expect(api.permissions.delete).toHaveBeenCalledWith('504', '510'))
    await waitFor(() =>
      expect(within(dialog).queryByRole('button', { name: 'Модераторы' })).not.toBeInTheDocument(),
    )
    expect(within(dialog).getByRole('form', { name: '@everyone' })).toBeVisible()
  })

  it('only shows the permissions tab to those who manage roles there', async () => {
    const api = createFakeApi({ user: { ...testUser, id: '999', username: 'carol' } })
    api.guilds.get.mockResolvedValue({
      guild: {
        ...testGuild,
        ownerId: '200',
        myRoleIds: ['510'],
        roles: testGuild.roles.map((role) =>
          role.id === '510' ? { ...role, permissions: String(Permission.ManageChannels) } : role,
        ),
      },
    })
    const { user } = renderApp(MEMES_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Настроить канал мемы' }))
    const dialog = await screen.findByRole('dialog', { name: 'Настройки канала' })
    expect(within(dialog).queryByRole('tab', { name: 'Права доступа' })).not.toBeInTheDocument()
    expect(within(dialog).getByLabelText('Название канала')).toBeVisible()
  })
})
