import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testMessage, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { Embed } from '@chinchi/shared'

const showWithEmbeds = async (embeds: Embed[]) => {
  const api = createFakeApi({ user: testUser })
  api.messages.list.mockResolvedValue({
    messages: [testMessage('1001', { content: 'смотри', embeds })],
  })
  renderApp(`/channels/${testGuild.id}/503`, { api })
  return (await screen.findByText('смотри')).closest('li') as HTMLElement
}

describe('link previews', () => {
  it('shows a card with the site, a safe title link, the description and the stored image', async () => {
    const item = await showWithEmbeds([
      {
        url: 'https://example.com/a',
        title: 'Big news',
        description: 'Something happened',
        siteName: 'Example',
        image: { url: '/api/v1/embeds/abc.webp', width: 400, height: 210 },
      },
    ])

    const card = within(item).getByRole('article', { name: 'Big news' })
    expect(within(card).getByText('Example')).toBeVisible()
    // The real host, so a page cannot pass itself off as another site.
    expect(within(card).getByText('example.com')).toBeVisible()
    const link = within(card).getByRole('link', { name: 'Big news' })
    expect(link).toHaveAttribute('href', 'https://example.com/a')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc')
    expect(link).toHaveAttribute('target', '_blank')
    expect(within(card).getByText('Something happened')).toBeVisible()
    const image = card.querySelector('img')
    expect(image).toHaveAttribute('src', '/api/v1/embeds/abc.webp')
    expect(image).toHaveAttribute('width', '400')
  })

  it('never links unsafe URLs and shows nothing without previews', async () => {
    const item = await showWithEmbeds([
      {
        url: 'javascript:alert(1)',
        title: 'Trap',
        description: null,
        siteName: null,
        image: null,
      },
    ])
    expect(within(item).queryByRole('link', { name: 'Trap' })).toBeNull()
    expect(within(item).getByText('Trap')).toBeVisible()
  })
})
