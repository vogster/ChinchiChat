import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testFriend, testMessage, testUser } from '../../test/fake-api'
import { fakeCiphertext, fakeReactionCiphertext } from '../../test/fake-e2ee'
import { renderApp } from '../../test/render-app'

import type { PrivateChannel } from '@chinchi/shared'

const encryptedDm: PrivateChannel = {
  id: '802',
  type: 'dm',
  name: null,
  ownerId: null,
  recipients: [testFriend],
  lastMessageId: '1301',
  encrypted: true,
}
const DM_PATH = `/channels/@me/${encryptedDm.id}`

const withReactedMessage = () => {
  const api = createFakeApi({ user: testUser })
  api.dms.list.mockResolvedValue({ channels: [encryptedDm] })
  api.messages.list.mockResolvedValue({
    messages: [
      testMessage('1301', {
        channelId: encryptedDm.id,
        guildId: null,
        content: '',
        ciphertext: fakeCiphertext('Кто идёт на концерт?'),
        encryptedReactions: [
          { userId: testFriend.id, version: '5', ciphertext: fakeReactionCiphertext(['👍', '🎉']) },
        ],
      }),
    ],
  })
  return api
}

const row = () => screen.getByText('Кто идёт на концерт?').closest('li') as HTMLElement
const reaction = (emoji: string) =>
  within(row()).queryByRole('button', { name: new RegExp(`^${emoji}`) })

describe('reactions in encrypted conversations', () => {
  it('show what everyone’s encrypted sets add up to', async () => {
    renderApp(DM_PATH, { api: withReactedMessage() })
    await screen.findByText('Кто идёт на концерт?')

    await waitFor(() => expect(reaction('👍')).toHaveAccessibleName('👍: 1'))
    expect(reaction('🎉')).toHaveAccessibleName('🎉: 1')
  })

  it('send my whole set, encrypted, when I toggle one', async () => {
    const api = withReactedMessage()
    const { user, e2ee } = renderApp(DM_PATH, { api })
    await screen.findByText('Кто идёт на концерт?')
    await waitFor(() => expect(reaction('👍')).toBeInTheDocument())

    await user.click(reaction('👍') as HTMLElement)

    await waitFor(() =>
      expect(e2ee.react).toHaveBeenCalledWith(
        expect.objectContaining({ id: encryptedDm.id }),
        '1301',
        ['👍'],
      ),
    )
    expect(api.reactions.add).not.toHaveBeenCalled()
  })

  it('follow changes from the gateway', async () => {
    const { gateway } = renderApp(DM_PATH, { api: withReactedMessage() })
    await screen.findByText('Кто идёт на концерт?')
    await waitFor(() => expect(reaction('👍')).toBeInTheDocument())

    act(() =>
      gateway.emit('E2EE_REACTION_UPDATE', {
        channelId: encryptedDm.id,
        guildId: null,
        messageId: '1301',
        userId: testFriend.id,
        reaction: { version: '6', ciphertext: fakeReactionCiphertext(['🔥']) },
      }),
    )

    await waitFor(() => expect(reaction('🔥')).toHaveAccessibleName('🔥: 1'))
    expect(reaction('👍')).not.toBeInTheDocument()
  })
})
