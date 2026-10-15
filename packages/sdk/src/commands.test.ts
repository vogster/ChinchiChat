import { describe, expect, it, vi } from 'vitest'

import { createApiClient } from './client'

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const setup = (response: Response) => {
  const fetch = vi.fn(async () => response)
  const api = createApiClient({ baseUrl: 'https://chat.example.com/api/v1', fetch })
  const call = () => {
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    return { url, method: init.method, body: init.body ? JSON.parse(init.body as string) : null }
  }
  return { api, call }
}

const bot = {
  id: '9',
  username: 'dice_bot',
  displayName: null,
  avatarUrl: null,
  bot: true,
}
const command = { id: '7', name: 'roll', description: 'Бросить', options: [], bot }

describe('slash commands', () => {
  it('registers and lists commands', async () => {
    const put = setup(jsonResponse(200, { success: true, data: { commands: [command] } }))
    expect(await put.api.commands.put([{ name: 'roll', description: 'Бросить' }])).toEqual({
      commands: [command],
    })
    expect(put.call()).toMatchObject({
      url: 'https://chat.example.com/api/v1/bots/@me/commands',
      method: 'PUT',
      body: [{ name: 'roll', description: 'Бросить' }],
    })

    const list = setup(jsonResponse(200, { success: true, data: { commands: [] } }))
    expect(await list.api.commands.guild('5')).toEqual({ commands: [] })
    expect(list.call().url).toBe('https://chat.example.com/api/v1/guilds/5/commands')
  })

  it('invokes and answers interactions', async () => {
    const invoke = setup(new Response(null, { status: 204 }))
    await invoke.api.interactions.invoke('3', { commandId: '7', options: { sides: '6' } })
    expect(invoke.call()).toMatchObject({
      url: 'https://chat.example.com/api/v1/channels/3/interactions',
      body: { commandId: '7', options: { sides: '6' } },
    })

    const respond = setup(new Response(null, { status: 500 }))
    await expect(respond.api.interactions.respond('8', 'tok', 'Выпало 4')).rejects.toThrow()
    expect(respond.call()).toMatchObject({
      url: 'https://chat.example.com/api/v1/interactions/8/tok/callback',
      body: { content: 'Выпало 4' },
    })
  })
})
