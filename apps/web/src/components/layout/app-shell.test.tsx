import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

describe('app shell', () => {
  it('renders navigation, the sidebar and the main area', async () => {
    renderApp('/', { user: testUser })

    const rail = await screen.findByRole('navigation', { name: 'Серверы' })
    expect(within(rail).getByRole('link', { name: 'Главная' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(rail).getByRole('button', { name: 'Добавить сервер' })).toBeInTheDocument()

    const sidebar = screen.getByRole('complementary', { name: 'Личные сообщения' })
    expect(within(sidebar).getByText('Пока нет личных сообщений')).toBeInTheDocument()
  })

  it('shows the display name, falling back to the username', async () => {
    renderApp('/', { user: { ...testUser, displayName: 'Алиса' } })

    const panel = await screen.findByRole('region', { name: 'Текущий пользователь' })
    expect(within(panel).getByText('Алиса')).toBeVisible()
  })

  it('logs out and returns to the login page, leaving no encryption keys behind', async () => {
    const api = createFakeApi({ user: testUser })
    const { user, router, e2ee } = renderApp('/', { api })

    await user.click(await screen.findByRole('button', { name: 'Выйти' }))

    expect(await screen.findByRole('heading', { name: 'С возвращением!' })).toBeVisible()
    expect(api.auth.logout).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/login')
    // The device left its conversations while the session still worked, then signed out.
    expect(e2ee.forget).toHaveBeenCalledTimes(1)
    expect(e2ee.forget.mock.invocationCallOrder[0]).toBeLessThan(
      api.auth.logout.mock.invocationCallOrder[0] as number,
    )
  })

  it('wipes encryption state when the session is revoked elsewhere', async () => {
    const api = createFakeApi({ user: testUser })
    const { gateway, router, e2ee } = renderApp('/', { api })
    await screen.findByRole('button', { name: 'Выйти' })

    act(() => gateway.rejectAuth())

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(e2ee.forget).toHaveBeenCalledTimes(1)
  })

  it('opens and closes the navigation drawer on small screens', async () => {
    const { user } = renderApp('/', { user: testUser })

    const drawer = await screen.findByTestId('navigation-drawer')
    expect(drawer).toHaveAttribute('data-open', 'false')

    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    expect(drawer).toHaveAttribute('data-open', 'true')

    await user.click(screen.getByRole('button', { name: 'Закрыть меню' }))
    expect(drawer).toHaveAttribute('data-open', 'false')
  })
})

describe('phone list screen', () => {
  it('switches between servers and chats from its tab bar, staying on the list', async () => {
    const { user, router } = renderApp('/', { user: testUser })
    await user.click(await screen.findByRole('button', { name: 'Открыть меню' }))
    const drawer = screen.getByTestId('navigation-drawer')
    const tabs = within(drawer).getByRole('navigation', { name: 'Разделы' })

    await user.click(within(tabs).getByRole('button', { name: 'Серверы' }))
    await waitFor(() =>
      expect(router.state.location.pathname.startsWith(`/channels/${testGuild.id}`)).toBe(true),
    )
    expect(drawer).toHaveAttribute('data-open', 'true')
    expect(within(tabs).getByRole('button', { name: 'Серверы' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await user.click(within(tabs).getByRole('button', { name: 'Чаты' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(drawer).toHaveAttribute('data-open', 'true')

    await user.click(within(tabs).getByRole('button', { name: 'Профиль' }))
    expect(await screen.findByRole('dialog', { name: 'Настройки пользователя' })).toBeVisible()
  })
})

describe('not found page', () => {
  it('links back home', async () => {
    const { user, router } = renderApp('/definitely/missing', { user: testUser })

    expect(await screen.findByRole('heading', { name: 'Страница не найдена' })).toBeVisible()
    await user.click(screen.getByRole('link', { name: 'На главную' }))

    expect(await screen.findByRole('heading', { name: 'Друзья', level: 1 })).toBeVisible()
    expect(router.state.location.pathname).toBe('/')
  })
})
