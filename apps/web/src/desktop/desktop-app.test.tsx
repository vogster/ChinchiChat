import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { initI18n } from '../lib/i18n'
import { createFakeShell } from '../test/fake-shell'
import { DesktopApp } from './desktop-app'
import { createDesktopSettings, createMemorySettingsStore } from './settings'

import type { DesktopActions } from './desktop-app'
import type { FetchLike } from '@chinchi/sdk'

initI18n('ru')

const instanceInfo = {
  name: 'Клуб',
  registrationMode: 'open',
  uploads: null,
  voice: false,
  requireVerifiedEmail: false,
}

/** A server with nobody signed in: instance info for everyone, 401 for the account. */
const server = vi.fn<FetchLike>(async (url) => {
  if (url.endsWith('/instance')) {
    return new Response(JSON.stringify({ success: true, data: { instance: instanceInfo } }), {
      status: 200,
    })
  }
  return new Response(
    JSON.stringify({ success: false, code: 'UNAUTHORIZED', error: 'Sign in first' }),
    { status: 401 },
  )
})

describe('DesktopApp', () => {
  it('asks for an instance on the first launch, remembers it and opens its sign-in', async () => {
    const store = createMemorySettingsStore()
    const settings = createDesktopSettings(store)
    const user = userEvent.setup()
    render(<DesktopApp settings={settings} initial={await settings.load()} fetch={server} />)

    await user.type(screen.getByLabelText('Адрес сервера'), 'chat.example.com')
    await user.click(screen.getByRole('button', { name: 'Подключиться' }))

    expect(await screen.findByRole('heading', { name: 'С возвращением!' })).toBeInTheDocument()
    await waitFor(async () =>
      expect(await settings.load()).toEqual({
        instanceUrl: 'https://chat.example.com',
        token: null,
      }),
    )
    // Every request from now on goes to that instance.
    expect(
      server.mock.calls.some(([url]) => url === 'https://chat.example.com/api/v1/users/@me'),
    ).toBe(true)
  })

  it('goes back to the picker when the shell is asked to change the instance', async () => {
    const store = createMemorySettingsStore()
    const settings = createDesktopSettings(store)
    await settings.setInstanceUrl('https://chat.example.com')
    await settings.setToken('secret-token')
    let actions: DesktopActions | null = null
    render(
      <DesktopApp
        settings={settings}
        initial={await settings.load()}
        fetch={server}
        shell={(given) => {
          actions = given
          return createFakeShell().shell
        }}
      />,
    )
    expect(await screen.findByRole('heading', { name: 'С возвращением!' })).toBeInTheDocument()
    // The frameless window keeps the app's title bar over the chat and the picker alike.
    expect(screen.getByRole('button', { name: 'Закрыть окно' })).toBeInTheDocument()

    await act(() => (actions as DesktopActions | null)?.changeInstance() ?? Promise.resolve())

    expect(await screen.findByLabelText('Адрес сервера')).toHaveValue('https://chat.example.com')
    expect(screen.getByRole('button', { name: 'Закрыть окно' })).toBeInTheDocument()
    expect(await settings.load()).toEqual({ instanceUrl: null, token: null })
  })

  it('skips the picker when an instance is already chosen', async () => {
    const store = createMemorySettingsStore()
    const settings = createDesktopSettings(store)
    await settings.setInstanceUrl('https://chat.example.com')
    render(<DesktopApp settings={settings} initial={await settings.load()} fetch={server} />)

    expect(await screen.findByRole('heading', { name: 'С возвращением!' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Адрес сервера')).not.toBeInTheDocument()
  })
})
