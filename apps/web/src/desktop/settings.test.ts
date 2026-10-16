import { describe, expect, it } from 'vitest'

import { createDesktopSettings, createMemorySettingsStore } from './settings'

describe('desktop settings', () => {
  it('start empty and remember the instance and the session token', async () => {
    const store = createMemorySettingsStore()
    const settings = createDesktopSettings(store)

    expect(await settings.load()).toEqual({ instanceUrl: null, token: null })

    await settings.setInstanceUrl('https://chat.example.com')
    await settings.setToken('secret-token')
    expect(await settings.load()).toEqual({
      instanceUrl: 'https://chat.example.com',
      token: 'secret-token',
    })
    // Another start of the app reads the same store.
    expect(await createDesktopSettings(store).load()).toEqual({
      instanceUrl: 'https://chat.example.com',
      token: 'secret-token',
    })
  })

  it('forget the token with the instance: a session belongs to one server', async () => {
    const store = createMemorySettingsStore()
    const settings = createDesktopSettings(store)
    await settings.setInstanceUrl('https://chat.example.com')
    await settings.setToken('secret-token')

    await settings.setInstanceUrl('https://other.example.com')

    expect(await settings.load()).toEqual({
      instanceUrl: 'https://other.example.com',
      token: null,
    })
    await settings.setToken(null)
    expect((await settings.load()).token).toBeNull()
  })
})
