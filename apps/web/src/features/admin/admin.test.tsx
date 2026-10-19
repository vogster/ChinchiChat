import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const admin = { ...testUser, isAdmin: true }

describe('instance administration', () => {
  it('is only for admins', async () => {
    const api = createFakeApi({ user: testUser })
    renderApp('/settings/account', { api })
    await screen.findByRole('heading', { name: 'Моя учётная запись' })
    expect(screen.queryByRole('link', { name: 'Администрирование' })).not.toBeInTheDocument()

    renderApp('/?admin=users', { api })
    const window_ = await screen.findByRole('dialog', { name: 'Администрирование' })
    expect(
      await within(window_).findByText('Этот раздел только для администраторов инстанса.'),
    ).toBeVisible()
    expect(api.admin.users).not.toHaveBeenCalled()
  })

  it('opens as a window over the page, like the other settings', async () => {
    const { router } = renderApp('/admin/guilds', { api: createFakeApi({ user: admin }) })

    const window_ = await screen.findByRole('dialog', { name: 'Администрирование' })
    expect(await within(window_).findByRole('list', { name: 'Серверы' })).toBeVisible()
    expect(router.state.location.pathname).toBe('/')
    expect(router.state.location.search).toEqual({ admin: 'guilds' })
  })

  it('goes back to the settings it was opened from, or closes', async () => {
    const { user, router } = renderApp('/?admin=users', {
      api: createFakeApi({ user: admin }),
    })

    const window_ = await screen.findByRole('dialog', { name: 'Администрирование' })
    await user.click(within(window_).getByRole('link', { name: 'Назад к настройкам' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ settings: 'account' }))

    await user.click(await screen.findByRole('link', { name: 'Администрирование' }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Администрирование' })).getByRole('button', {
        name: 'Закрыть администрирование',
      }),
    )
    await waitFor(() => expect(router.state.location.search).toEqual({}))
    expect(screen.queryByRole('dialog', { name: 'Администрирование' })).not.toBeInTheDocument()
  })

  it('opens from the settings and suspends a user', async () => {
    const api = createFakeApi({ user: admin })
    const { user } = renderApp('/settings/account', { api })

    await user.click(await screen.findByRole('link', { name: 'Администрирование' }))
    const list = await screen.findByRole('list', { name: 'Пользователи' })
    expect(await within(list).findByText('bob@example.com')).toBeVisible()
    await user.click(within(list).getByRole('button', { name: 'Заблокировать — bob' }))

    await waitFor(() =>
      expect(api.admin.updateUser).toHaveBeenCalledWith('200', { suspended: true }),
    )
    expect(await within(list).findByRole('button', { name: 'Разблокировать — bob' })).toBeVisible()
    // Your own row offers nothing to change.
    expect(within(list).queryByRole('button', { name: /— alice$/ })).not.toBeInTheDocument()
  })

  it('searches users', async () => {
    const api = createFakeApi({ user: admin })
    const { user } = renderApp('/?admin=users', { api })

    await user.type(await screen.findByRole('searchbox', { name: 'Поиск' }), 'bob')

    await waitFor(() =>
      expect(api.admin.users).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'bob' })),
    )
  })

  it('deletes a server after confirming', async () => {
    const api = createFakeApi({ user: admin })
    const { user } = renderApp('/?admin=guilds', { api })

    const list = await screen.findByRole('list', { name: 'Серверы' })
    expect(await within(list).findByText('Котики')).toBeVisible()
    await user.click(within(list).getByRole('button', { name: 'Удалить сервер Котики' }))
    const dialog = await screen.findByRole('dialog', { name: 'Удалить сервер Котики?' })
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))

    await waitFor(() => expect(api.admin.deleteGuild).toHaveBeenCalledWith('500'))
  })

  it('switches registration to invites and makes an invite link', async () => {
    const api = createFakeApi({ user: admin })
    const { user } = renderApp('/?admin=instance', { api })

    await user.selectOptions(await screen.findByLabelText('Регистрация', { exact: true }), 'invite')
    await user.click(screen.getByRole('switch', { name: 'Требовать подтверждённый email' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() =>
      expect(api.admin.updateSettings).toHaveBeenCalledWith({
        registrationMode: 'invite',
        maxGuildsPerUser: null,
        requireVerifiedEmail: true,
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Создать приглашение' }))
    expect(api.admin.createInvite).toHaveBeenCalled()
    const invites = await screen.findByRole('list', { name: 'Приглашения' })
    expect(await within(invites).findByText(/register\?invite=Abcd2345Efgh6789/)).toBeVisible()
  })
})

describe('registering by invite', () => {
  it('asks for the code, filled in from the link', async () => {
    const api = createFakeApi({ registrationMode: 'invite' })
    renderApp('/register?invite=Abcd2345Efgh6789', { api })

    expect(await screen.findByLabelText('Код приглашения', { exact: true })).toHaveValue(
      'Abcd2345Efgh6789',
    )
  })
})
