import { describe, expect, it, vi } from 'vitest'

import { createApiClient } from './client'

const setup = (response: Response) => {
  const fetch = vi.fn(async () => response)
  const api = createApiClient({ baseUrl: 'https://chat.example.com/api/v1', fetch })
  const call = () => {
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    return { url, method: init.method, body: init.body ? JSON.parse(init.body as string) : null }
  }
  return { api, call }
}

describe('announcements', () => {
  it('follows a channel and publishes messages', async () => {
    const follow = setup(new Response(null, { status: 500 }))
    await expect(follow.api.announcements.follow('1', '2')).rejects.toThrow()
    expect(follow.call()).toMatchObject({
      url: 'https://chat.example.com/api/v1/channels/1/followers',
      method: 'POST',
      body: { channelId: '2' },
    })

    const publish = setup(new Response(null, { status: 500 }))
    await expect(publish.api.announcements.publish('1', '9')).rejects.toThrow()
    expect(publish.call()).toMatchObject({
      url: 'https://chat.example.com/api/v1/channels/1/messages/9/publish',
      method: 'POST',
    })
  })
})

describe('account deletion', () => {
  it('sends the password, or deletes as an admin', async () => {
    const self = setup(new Response(null, { status: 204 }))
    await self.api.users.deleteMe('secret')
    expect(self.call()).toMatchObject({
      url: 'https://chat.example.com/api/v1/users/@me',
      method: 'DELETE',
      body: { password: 'secret' },
    })

    const admin = setup(new Response(null, { status: 204 }))
    await admin.api.admin.deleteUser('7')
    expect(admin.call()).toMatchObject({
      url: 'https://chat.example.com/api/v1/admin/users/7',
      method: 'DELETE',
    })
  })
})
