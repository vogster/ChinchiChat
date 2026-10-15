import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testMessage, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const CHANNEL_URL = `/channels/${testGuild.id}/503`

const ME = { id: testUser.id, username: testUser.username, displayName: null, avatarUrl: null }

const withReactions = ({ mine = false } = {}) => {
  const api = createFakeApi({ user: testUser })
  api.messages.list.mockResolvedValue({
    messages: [
      testMessage('1001', {
        content: 'праздник',
        ...(mine ? { author: ME } : {}),
        reactions: [
          { emoji: '🎉', count: 2, me: true },
          { emoji: '👍', count: 1, me: false },
        ],
      }),
    ],
  })
  return api
}

const row = () => screen.getByText('праздник').closest('li') as HTMLElement
const reactionButton = (emoji: string) =>
  within(row()).getByRole('button', { name: new RegExp(`^${emoji}`) })

describe('reactions', () => {
  it('shows reactions with counts and marks mine', async () => {
    renderApp(CHANNEL_URL, { api: withReactions() })
    await screen.findByText('праздник')

    expect(reactionButton('🎉')).toHaveAttribute('aria-pressed', 'true')
    expect(reactionButton('🎉')).toHaveAccessibleName('🎉: 2, вы среди них')
    expect(reactionButton('👍')).toHaveAttribute('aria-pressed', 'false')
    expect(reactionButton('👍')).toHaveAccessibleName('👍: 1')
  })

  it('toggles a reaction by clicking it', async () => {
    const api = withReactions()
    const { user } = renderApp(CHANNEL_URL, { api })
    await screen.findByText('праздник')

    await user.click(reactionButton('🎉'))
    await waitFor(() => expect(api.reactions.remove).toHaveBeenCalledWith('503', '1001', '🎉'))
    expect(reactionButton('🎉')).toHaveAccessibleName('🎉: 1')

    await user.click(reactionButton('👍'))
    await waitFor(() => expect(api.reactions.add).toHaveBeenCalledWith('503', '1001', '👍'))
    expect(reactionButton('👍')).toHaveAccessibleName('👍: 2, вы среди них')
  })

  it('adds a quick reaction from the message toolbar', async () => {
    const api = withReactions()
    const { user } = renderApp(CHANNEL_URL, { api })
    await screen.findByText('праздник')

    await user.hover(row())
    await user.click(within(row()).getByRole('button', { name: 'Добавить реакцию' }))
    await user.click(await screen.findByRole('button', { name: 'Отреагировать: 😂' }))

    await waitFor(() => expect(api.reactions.add).toHaveBeenCalledWith('503', '1001', '😂'))
    expect(reactionButton('😂')).toHaveAccessibleName('😂: 1, вы среди них')
  })

  it('follows reactions of others live, without double-counting my own', async () => {
    const api = withReactions()
    const { user, gateway } = renderApp(CHANNEL_URL, { api })
    await screen.findByText('праздник')
    const event = { channelId: '503', guildId: testGuild.id, messageId: '1001' }

    act(() => gateway.emit('MESSAGE_REACTION_ADD', { ...event, userId: '200', emoji: '👍' }))
    expect(await within(row()).findByRole('button', { name: '👍: 2' })).toBeVisible()

    await user.click(reactionButton('👍'))
    act(() => gateway.emit('MESSAGE_REACTION_ADD', { ...event, userId: testUser.id, emoji: '👍' }))
    await waitFor(() => expect(reactionButton('👍')).toHaveAccessibleName('👍: 3, вы среди них'))

    act(() => gateway.emit('MESSAGE_REACTION_REMOVE', { ...event, userId: '200', emoji: '🎉' }))
    act(() =>
      gateway.emit('MESSAGE_REACTION_REMOVE', { ...event, userId: testUser.id, emoji: '🎉' }),
    )
    await waitFor(() => expect(within(row()).queryByRole('button', { name: /^🎉/ })).toBeNull())
  })

  it('offers to take back a quick reaction I already gave', async () => {
    const { user } = renderApp(CHANNEL_URL, { api: withReactions() })
    await screen.findByText('праздник')

    await user.hover(row())
    await user.click(within(row()).getByRole('button', { name: 'Добавить реакцию' }))

    expect(await screen.findByRole('button', { name: 'Убрать реакцию: 🎉' })).toBeVisible()
  })

  it('keeps my reactions when I edit the message', async () => {
    const api = withReactions({ mine: true })
    api.messages.update.mockResolvedValueOnce({
      message: testMessage('1001', {
        content: 'праздник!',
        author: ME,
        editedAt: '2026-10-14T12:30:00.000Z',
      }),
    })
    const { user } = renderApp(CHANNEL_URL, { api })
    await screen.findByText('праздник')

    await user.hover(row())
    await user.click(within(row()).getByRole('button', { name: 'Редактировать' }))
    const box = screen.getByRole('textbox', { name: 'Изменить сообщение' })
    await user.type(box, '!{Enter}')

    expect(await screen.findByText('праздник!')).toBeVisible()
    const edited = screen.getByText('праздник!').closest('li') as HTMLElement
    expect(within(edited).getByRole('button', { name: '🎉: 2, вы среди них' })).toBeVisible()
  })

  it('keeps reactions when the message is edited elsewhere', async () => {
    const { gateway } = renderApp(CHANNEL_URL, { api: withReactions() })
    await screen.findByText('праздник')

    act(() =>
      gateway.emit('MESSAGE_UPDATE', testMessage('1001', { content: 'праздник!', reactions: [] })),
    )

    expect(await screen.findByText('праздник!')).toBeVisible()
    expect(
      within(screen.getByText('праздник!').closest('li') as HTMLElement).getByRole('button', {
        name: '🎉: 2, вы среди них',
      }),
    ).toBeVisible()
  })
})
