import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { apiError, createFakeApi, testGuild, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const member = { ...testUser, id: '999', username: 'carol' }
const GUILD_URL = `/channels/${testGuild.id}`
const GENERAL_URL = `${GUILD_URL}/503`

const openGuildMenu = async (user: ReturnType<typeof renderApp>['user']) => {
  await user.click(await screen.findByRole('button', { name: 'Меню сервера Котики' }))
  return screen.findByRole('menu')
}

describe('server rail', () => {
  it('lists servers and opens one at its first text channel', async () => {
    const { user, router } = renderApp('/', { user: testUser })

    const rail = await screen.findByRole('navigation', { name: 'Серверы' })
    await user.click(await within(rail).findByRole('link', { name: 'Котики' }))

    expect(await screen.findByRole('heading', { name: 'общий', level: 1 })).toBeVisible()
    expect(router.state.location.pathname).toBe(GENERAL_URL)
    expect(within(rail).getByRole('link', { name: 'Котики' })).toHaveAttribute(
      'data-status',
      'active',
    )
  })

  it('creates a server named in the interface language and opens it', async () => {
    const api = createFakeApi({ user: testUser })
    const { user, router } = renderApp('/', { api })

    await user.click(await screen.findByRole('button', { name: 'Добавить сервер' }))
    const dialog = await screen.findByRole('dialog', { name: 'Создайте свой сервер' })
    const name = within(dialog).getByLabelText('Название сервера')
    expect(name).toHaveValue('Сервер alice')
    await user.clear(name)
    await user.type(name, 'Котики')
    await user.click(within(dialog).getByRole('button', { name: 'Создать' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(GENERAL_URL))
    expect(api.guilds.create).toHaveBeenCalledWith({ name: 'Котики', locale: 'ru' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('joins a server from a pasted invite link', async () => {
    const api = createFakeApi({ user: testUser })
    const { user, router } = renderApp('/', { api })

    await user.click(await screen.findByRole('button', { name: 'Добавить сервер' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(
      within(dialog).getByLabelText('Ссылка-приглашение'),
      'https://chat.example.com/invite/AbCd1234',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Присоединиться' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(GENERAL_URL))
    expect(api.invites.accept).toHaveBeenCalledWith('AbCd1234')
  })

  it('explains an unusable invite link', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp('/', { api })

    await user.click(await screen.findByRole('button', { name: 'Добавить сервер' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Ссылка-приглашение'), 'not a link!')
    await user.click(within(dialog).getByRole('button', { name: 'Присоединиться' }))

    expect(await within(dialog).findByText('Вставьте ссылку-приглашение или её код.')).toBeVisible()
    expect(api.invites.accept).not.toHaveBeenCalled()
  })
})

describe('server view', () => {
  it('shows channels grouped by category, with voice channels not yet openable', async () => {
    renderApp(GENERAL_URL, { user: testUser })

    const channels = await screen.findByRole('navigation', { name: 'Каналы' })
    expect(within(channels).getByRole('button', { name: 'Текстовые каналы' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(within(channels).getByRole('link', { name: 'мемы' })).toBeVisible()
    expect(within(channels).getByText('Общий')).toBeVisible()
    expect(within(channels).queryByRole('link', { name: 'Общий' })).not.toBeInTheDocument()
  })

  it('collapses a category', async () => {
    const { user } = renderApp(GENERAL_URL, { user: testUser })

    const channels = await screen.findByRole('navigation', { name: 'Каналы' })
    await user.click(within(channels).getByRole('button', { name: 'Текстовые каналы' }))

    expect(within(channels).queryByRole('link', { name: 'мемы' })).not.toBeInTheDocument()
  })

  it('shows the channel topic and the member list', async () => {
    renderApp(`${GUILD_URL}/504`, { user: testUser })

    expect(await screen.findByText('Только смешное')).toBeVisible()
    const members = await screen.findByRole('complementary', { name: 'Участники — 2' })
    expect(within(members).getByText('Боб')).toBeInTheDocument()
    expect(within(members).getByLabelText('Владелец сервера')).toBeInTheDocument()
  })

  it('shows a friendly message for servers the user cannot see', async () => {
    const api = createFakeApi({ user: testUser })
    api.guilds.get.mockRejectedValue(apiError(404, 'UNKNOWN_GUILD'))
    renderApp('/channels/777', { api })

    expect(await screen.findByText('Сервер не найден или у вас нет к нему доступа.')).toBeVisible()
  })
})

describe('server menu', () => {
  it('creates an invite link and copies it', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(GENERAL_URL, { api })

    const menu = await openGuildMenu(user)
    await user.click(within(menu).getByRole('menuitem', { name: 'Пригласить людей' }))

    const dialog = await screen.findByRole('dialog', { name: 'Пригласить друзей на Котики' })
    const link = within(dialog).getByLabelText('Ссылка-приглашение')
    await waitFor(() => expect(link).toHaveValue(`${window.location.origin}/invite/AbCd1234`))
    expect(api.invites.create).toHaveBeenCalledWith('503', {})

    await user.click(within(dialog).getByRole('button', { name: 'Копировать' }))
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/invite/AbCd1234`)
    expect(within(dialog).getByRole('button', { name: 'Скопировано' })).toBeVisible()

    await user.click(within(dialog).getByLabelText('Сделать ссылку бессрочной'))
    await waitFor(() =>
      expect(api.invites.create).toHaveBeenCalledWith('503', { maxAgeSeconds: 0 }),
    )
  })

  it('lets the owner create a channel in a category', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(GENERAL_URL, { api })

    await user.click(
      await screen.findByRole('button', { name: 'Создать канал в категории Текстовые каналы' }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Создать канал' })
    await user.type(within(dialog).getByLabelText('Название канала'), 'Новости Клуба')
    expect(within(dialog).getByText('Будет создан как #новости-клуба')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Создать' }))

    await waitFor(() =>
      expect(api.channels.create).toHaveBeenCalledWith(testGuild.id, {
        type: 'text',
        name: 'Новости Клуба',
        parentId: '501',
      }),
    )
  })

  it('lets the owner create a voice channel and a category', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(GENERAL_URL, { api })

    await user.click(
      within(await openGuildMenu(user)).getByRole('menuitem', { name: 'Создать канал' }),
    )
    let dialog = await screen.findByRole('dialog', { name: 'Создать канал' })
    await user.click(within(dialog).getByRole('radio', { name: /Голосовой/ }))
    await user.type(within(dialog).getByLabelText('Название канала'), 'Лаунж')
    await user.click(within(dialog).getByRole('button', { name: 'Создать' }))
    await waitFor(() =>
      expect(api.channels.create).toHaveBeenCalledWith(testGuild.id, {
        type: 'voice',
        name: 'Лаунж',
        parentId: null,
      }),
    )

    await user.click(
      within(await openGuildMenu(user)).getByRole('menuitem', { name: 'Создать категорию' }),
    )
    dialog = await screen.findByRole('dialog', { name: 'Создать категорию' })
    await user.type(within(dialog).getByLabelText('Название категории'), 'Игры')
    await user.click(within(dialog).getByRole('button', { name: 'Создать' }))
    await waitFor(() =>
      expect(api.channels.create).toHaveBeenCalledWith(testGuild.id, {
        type: 'category',
        name: 'Игры',
        parentId: null,
      }),
    )
  })

  it('lets the owner rename and delete a channel', async () => {
    const api = createFakeApi({ user: testUser })
    const { user, router } = renderApp(`${GUILD_URL}/504`, { api })

    await user.click(await screen.findByRole('button', { name: 'Настроить канал мемы' }))
    let dialog = await screen.findByRole('dialog', { name: 'Настройки канала' })
    const topic = within(dialog).getByLabelText('Тема канала')
    await user.clear(topic)
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(api.channels.update).toHaveBeenCalledWith('504', { topic: null }))

    await user.click(await screen.findByRole('button', { name: 'Настроить канал мемы' }))
    dialog = await screen.findByRole('dialog', { name: 'Настройки канала' })
    await user.click(within(dialog).getByRole('button', { name: 'Удалить канал' }))
    await user.click(within(dialog).getByRole('button', { name: 'Да, удалить' }))

    await waitFor(() => expect(api.channels.delete).toHaveBeenCalledWith('504'))
    await waitFor(() => expect(router.state.location.pathname).toBe(GENERAL_URL))
  })

  it('lets the owner rename, transfer and delete the server', async () => {
    const api = createFakeApi({ user: testUser })
    const { user, router } = renderApp(GENERAL_URL, { api })

    await user.click(
      within(await openGuildMenu(user)).getByRole('menuitem', { name: 'Настройки сервера' }),
    )
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/server-settings/${testGuild.id}/overview`),
    )
    const page = await screen.findByRole('main')
    expect(within(page).getByRole('heading', { name: 'Обзор', level: 1 })).toBeVisible()

    const name = within(page).getByLabelText('Название сервера', {
      selector: 'input:not([placeholder])',
    })
    await user.clear(name)
    await user.type(name, 'Котики 2')
    await user.click(within(page).getByRole('button', { name: 'Сохранить' }))
    await waitFor(() =>
      expect(api.guilds.update).toHaveBeenCalledWith(testGuild.id, { name: 'Котики 2' }),
    )

    await user.selectOptions(await within(page).findByLabelText('Новый владелец'), 'Боб')
    expect(within(page).getByRole('button', { name: 'Удалить сервер' })).toBeDisabled()
    await user.type(within(page).getByPlaceholderText('Котики'), 'Котики')
    await user.click(within(page).getByRole('button', { name: 'Удалить сервер' }))

    await waitFor(() => expect(api.guilds.delete).toHaveBeenCalledWith(testGuild.id))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('transfers ownership to the chosen member', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(`/server-settings/${testGuild.id}/overview`, { api })

    const page = await screen.findByRole('main')
    await user.selectOptions(await within(page).findByLabelText('Новый владелец'), 'Боб')
    await user.click(within(page).getByRole('button', { name: 'Передать' }))

    await waitFor(() => expect(api.guilds.transfer).toHaveBeenCalledWith(testGuild.id, '200'))
  })

  it('closes server settings back to the server', async () => {
    const { user, router } = renderApp(`/server-settings/${testGuild.id}`, { user: testUser })

    await user.click(await screen.findByRole('link', { name: 'Закрыть настройки сервера' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(GENERAL_URL))
  })

  it('shows members only the actions they may take, and lets them leave', async () => {
    const api = createFakeApi({ user: member })
    const { user, router } = renderApp(GENERAL_URL, { api })

    const menu = await openGuildMenu(user)
    expect(
      within(menu).queryByRole('menuitem', { name: 'Настройки сервера' }),
    ).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Создать канал' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Настроить канал/ })).not.toBeInTheDocument()

    await user.click(within(menu).getByRole('menuitem', { name: 'Покинуть сервер' }))
    const dialog = await screen.findByRole('dialog', { name: 'Покинуть «Котики»' })
    await user.click(within(dialog).getByRole('button', { name: 'Покинуть сервер' }))

    await waitFor(() => expect(api.guilds.leave).toHaveBeenCalledWith(testGuild.id))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})

describe('invite page', () => {
  it('previews the server for guests and offers to log in or register', async () => {
    renderApp('/invite/AbCd1234')

    expect(await screen.findByRole('heading', { name: 'Котики' })).toBeVisible()
    expect(screen.getByText('Боб приглашает вас присоединиться')).toBeVisible()
    expect(screen.getByText('2 участника')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Войти, чтобы присоединиться' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Finvite%2FAbCd1234',
    )
    expect(screen.getByRole('link', { name: 'Создать учётную запись' })).toHaveAttribute(
      'href',
      '/register?redirect=%2Finvite%2FAbCd1234',
    )
  })

  it('lets a signed-in user accept and opens the server', async () => {
    const api = createFakeApi({ user: member })
    const { user, router } = renderApp('/invite/AbCd1234', { api })

    await user.click(await screen.findByRole('button', { name: 'Принять приглашение' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(GENERAL_URL))
    expect(api.invites.accept).toHaveBeenCalledWith('AbCd1234')
  })

  it('explains invalid invites', async () => {
    const api = createFakeApi()
    api.invites.get.mockRejectedValue(apiError(404, 'UNKNOWN_INVITE'))
    renderApp('/invite/nope', { api })

    expect(
      await screen.findByRole('heading', { name: 'Приглашение недействительно' }),
    ).toBeVisible()
  })
})
