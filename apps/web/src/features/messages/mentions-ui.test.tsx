import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testMessage, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const toMe = { users: [testUser.id], roles: [], everyone: false, here: false }

describe('mentions in the interface', () => {
  it('counts live mentions on channels and servers', async () => {
    const { gateway } = renderApp(`/channels/${testGuild.id}/503`, { user: testUser })
    await screen.findByRole('link', { name: 'мемы' })

    act(() => {
      gateway.emit('MESSAGE_CREATE', testMessage('2001', { channelId: '504', mentions: toMe }))
      gateway.emit('MESSAGE_CREATE', testMessage('2002', { channelId: '504', mentions: toMe }))
    })

    const channel = await screen.findByRole('link', {
      name: 'мемы (есть непрочитанные, упоминаний: 2)',
    })
    expect(within(channel).getByText('2')).toBeVisible()
    const server = await screen.findByRole('link', {
      name: new RegExp(`^${testGuild.name} \\(.*упоминаний: 2\\)$`),
    })
    expect(within(server.parentElement as HTMLElement).getByText('2')).toBeVisible()
  })

  it('highlights messages that mention me', async () => {
    const api = createFakeApi({ user: testUser })
    api.messages.list.mockResolvedValue({
      messages: [
        testMessage('1001', { content: 'эй', mentions: toMe }),
        testMessage('1002', { content: 'просто так' }),
      ],
    })
    renderApp(`/channels/${testGuild.id}/503`, { api })

    await waitFor(() =>
      expect(document.querySelector('[data-message-id="1001"]')).toHaveAttribute(
        'data-mentioned',
        'true',
      ),
    )
    expect(document.querySelector('[data-message-id="1002"]')).not.toHaveAttribute('data-mentioned')
  })
})
