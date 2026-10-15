import { DEFAULT_EVERYONE_PERMISSIONS, Permission } from '@chinchi/shared'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { apiError, createFakeApi, testGuild, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { GuildDetail, Role } from '@chinchi/shared'

const ROLES_URL = `/server-settings/${testGuild.id}/roles`
const MEMBERS_URL = `/server-settings/${testGuild.id}/members`
const carol = { ...testUser, id: '999', username: 'carol' }
const [everyone, moderators] = testGuild.roles as [Role, Role]

/** Carol holds «Менеджеры» (position 2, MANAGE_ROLES + KICK) above «Модераторы». */
const managerGuild: GuildDetail = {
  ...testGuild,
  ownerId: '200',
  myRoleIds: ['530'],
  roles: [
    everyone,
    moderators,
    {
      ...moderators,
      id: '530',
      name: 'Менеджеры',
      position: 2,
      hoist: false,
      permissions: String(Permission.ManageRoles | Permission.KickMembers),
    },
    { ...moderators, id: '540', name: 'Админы', position: 3, hoist: false },
  ],
}

const asManager = () => {
  const api = createFakeApi({ user: carol })
  api.guilds.get.mockResolvedValue({ guild: managerGuild })
  return api
}

const roleList = () => screen.findByRole('list', { name: 'Роли' })

describe('server settings: roles', () => {
  it('lists roles highest first and opens the editor', async () => {
    const { user } = renderApp(ROLES_URL, { user: testUser })

    const list = await roleList()
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Модераторы', '@everyone'])
    expect(screen.getByText('Выберите роль, чтобы изменить её.')).toBeVisible()

    await user.click(within(list).getByRole('button', { name: '@everyone' }))
    const editor = await screen.findByRole('form', { name: 'Редактировать роль @everyone' })
    // @everyone cannot be renamed, recolored or deleted.
    expect(within(editor).queryByLabelText('Название роли')).not.toBeInTheDocument()
    expect(within(editor).queryByRole('button', { name: 'Удалить роль' })).not.toBeInTheDocument()
    expect(within(editor).getByRole('switch', { name: 'Отправлять сообщения' })).toBeChecked()
  })

  it('creates a role and selects it', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(ROLES_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Создать роль' }))

    expect(api.roles.create).toHaveBeenCalledWith(testGuild.id)
    expect(await screen.findByRole('form', { name: 'Редактировать роль new role' })).toBeVisible()
    expect(api.roles.list).toHaveBeenCalled()
  })

  it('saves only what changed', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(ROLES_URL, { api })

    await user.click(within(await roleList()).getByRole('button', { name: 'Модераторы' }))
    const editor = await screen.findByRole('form', { name: 'Редактировать роль Модераторы' })
    const save = within(editor).getByRole('button', { name: 'Сохранить изменения' })
    expect(save).toBeDisabled()

    const name = within(editor).getByLabelText('Название роли')
    await user.clear(name)
    await user.type(name, 'Стража')
    await user.click(within(editor).getByRole('button', { name: '#e74c3c' }))
    await user.click(within(editor).getByRole('switch', { name: /Показывать участников/ }))
    await user.click(within(editor).getByRole('switch', { name: 'Банить участников' }))
    await user.click(within(editor).getByRole('switch', { name: 'Управлять сообщениями' }))
    await user.click(save)

    await waitFor(() =>
      expect(api.roles.update).toHaveBeenCalledWith(testGuild.id, '510', {
        name: 'Стража',
        color: 0xe74c3c,
        hoist: false,
        permissions: String(Permission.KickMembers | Permission.BanMembers),
      }),
    )
    expect(await screen.findByText('Изменения сохранены')).toBeVisible()
    expect(within(await roleList()).getByRole('button', { name: 'Стража' })).toBeVisible()
  })

  it('resets unsaved changes', async () => {
    const { user } = renderApp(ROLES_URL, { user: testUser })

    await user.click(within(await roleList()).getByRole('button', { name: 'Модераторы' }))
    const editor = await screen.findByRole('form', { name: 'Редактировать роль Модераторы' })
    const kick = within(editor).getByRole('switch', { name: 'Выгонять участников' })
    await user.click(kick)
    expect(kick).not.toBeChecked()

    await user.click(within(editor).getByRole('button', { name: 'Сбросить' }))
    expect(kick).toBeChecked()
  })

  it('deletes a role after confirmation', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(ROLES_URL, { api })

    await user.click(within(await roleList()).getByRole('button', { name: 'Модераторы' }))
    const editor = await screen.findByRole('form', { name: 'Редактировать роль Модераторы' })
    await user.click(within(editor).getByRole('button', { name: 'Удалить роль' }))
    expect(within(editor).getByText(/Удалить роль «Модераторы»\?/)).toBeVisible()
    await user.click(within(editor).getByRole('button', { name: 'Удалить роль' }))

    await waitFor(() => expect(api.roles.delete).toHaveBeenCalledWith(testGuild.id, '510'))
    await waitFor(() =>
      expect(within(screen.getByRole('list', { name: 'Роли' })).queryByText('Модераторы')).toBe(
        null,
      ),
    )
  })

  it('shows API errors', async () => {
    const api = createFakeApi({ user: testUser })
    api.roles.create.mockRejectedValue(apiError(403, 'MISSING_PERMISSIONS'))
    const { user } = renderApp(ROLES_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Создать роль' }))
    expect(await screen.findByRole('alert')).toBeVisible()
  })

  it('follows role changes from other admins', async () => {
    const { gateway } = renderApp(ROLES_URL, { user: testUser })
    const list = await roleList()

    act(() =>
      gateway.emit('GUILD_ROLE_UPDATE', {
        guildId: testGuild.id,
        role: { ...moderators, name: 'Хранители' },
      }),
    )
    expect(await within(list).findByRole('button', { name: 'Хранители' })).toBeVisible()
  })
})

describe('server settings: role hierarchy', () => {
  it('lets managers move and edit only roles below their own', async () => {
    const api = asManager()
    const { user } = renderApp(ROLES_URL, { api })
    const list = await roleList()

    // Above Carol's highest role: locked.
    expect(within(list).getByRole('button', { name: 'Опустить роль Админы' })).toBeDisabled()
    expect(within(list).getByRole('button', { name: 'Поднять роль Менеджеры' })).toBeDisabled()
    // «Модераторы» cannot go above Carol's own role, nor below @everyone.
    expect(within(list).getByRole('button', { name: 'Поднять роль Модераторы' })).toBeDisabled()
    expect(within(list).getByRole('button', { name: 'Опустить роль Модераторы' })).toBeDisabled()

    await user.click(within(list).getByRole('button', { name: 'Админы' }))
    const locked = await screen.findByRole('form', { name: 'Редактировать роль Админы' })
    expect(within(locked).getByText('Эта роль выше вашей — изменить её нельзя.')).toBeVisible()
    expect(within(locked).getByLabelText('Название роли')).toBeDisabled()

    await user.click(within(list).getByRole('button', { name: 'Модераторы' }))
    const editor = await screen.findByRole('form', { name: 'Редактировать роль Модераторы' })
    // Carol may keep or remove what the role has, but only grant what she has herself.
    expect(within(editor).getByRole('switch', { name: 'Управлять сообщениями' })).toBeEnabled()
    expect(within(editor).getByRole('switch', { name: 'Банить участников' })).toBeDisabled()
    expect(within(editor).getByRole('switch', { name: 'Управлять ролями' })).toBeEnabled()
  })

  it('swaps neighbouring roles', async () => {
    const api = createFakeApi({ user: testUser })
    api.guilds.get.mockResolvedValue({ guild: { ...managerGuild, ownerId: testUser.id } })
    const { user } = renderApp(ROLES_URL, { api })

    await user.click(
      within(await roleList()).getByRole('button', { name: 'Поднять роль Модераторы' }),
    )
    await waitFor(() =>
      expect(api.roles.reorder).toHaveBeenCalledWith(testGuild.id, [
        { id: '510', position: 2 },
        { id: '530', position: 1 },
      ]),
    )
  })

  it('drags a role above others, within reach only', async () => {
    const api = createFakeApi({ user: testUser })
    api.guilds.get.mockResolvedValue({ guild: { ...managerGuild, ownerId: testUser.id } })
    renderApp(ROLES_URL, { api })
    const list = await roleList()
    const row = (name: string) =>
      within(list).getByRole('button', { name }).closest('li') as HTMLElement

    fireEvent.dragStart(row('Модераторы'))
    fireEvent.dragOver(row('Админы'))
    fireEvent.drop(row('Админы'))

    await waitFor(() =>
      expect(api.roles.reorder).toHaveBeenCalledWith(testGuild.id, [
        { id: '510', position: 3 },
        { id: '540', position: 2 },
        { id: '530', position: 1 },
      ]),
    )
    expect(row('@everyone')).not.toHaveAttribute('draggable')
  })

  it('hides sections the user may not use', async () => {
    const { router } = renderApp(`/server-settings/${testGuild.id}`, { api: asManager() })

    await waitFor(() => expect(router.state.location.pathname).toBe(ROLES_URL))
    const nav = await screen.findByRole('navigation', { name: 'Котики' })
    expect(within(nav).queryByRole('link', { name: 'Обзор' })).not.toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Роли' })).toBeVisible()
  })

  it('refuses sections opened without permission', async () => {
    renderApp(`/server-settings/${testGuild.id}/overview`, { api: asManager() })
    expect(await screen.findByText('У вас нет прав на этот раздел.')).toBeVisible()
  })
})

describe('server settings: members', () => {
  it('adds and removes roles', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(MEMBERS_URL, { api })

    const bobRoles = await screen.findByRole('list', { name: 'Роли участника Боб' })
    expect(within(bobRoles).getByText('Модераторы')).toBeVisible()
    await user.click(within(bobRoles).getByRole('button', { name: 'Убрать роль Модераторы у Боб' }))
    await waitFor(() =>
      expect(api.roles.removeFromMember).toHaveBeenCalledWith(testGuild.id, '200', '510'),
    )
    expect(await within(bobRoles).findByText('Нет ролей')).toBeVisible()

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Добавить роль участнику alice' }),
      'Модераторы',
    )
    await waitFor(() =>
      expect(api.roles.addToMember).toHaveBeenCalledWith(testGuild.id, testUser.id, '510'),
    )
    expect(
      await within(screen.getByRole('list', { name: 'Роли участника alice' })).findByText(
        'Модераторы',
      ),
    ).toBeVisible()
  })

  it('does not offer roles above the manager', async () => {
    renderApp(MEMBERS_URL, { api: asManager() })

    const select = await screen.findByRole('combobox', { name: 'Добавить роль участнику alice' })
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Добавить роль', 'Модераторы'])
  })
})

describe('everyone permissions default', () => {
  it('matches the server default', () => {
    expect(everyone.permissions).toBe(String(DEFAULT_EVERYONE_PERMISSIONS))
  })
})
