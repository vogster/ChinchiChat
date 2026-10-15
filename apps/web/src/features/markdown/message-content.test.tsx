import { waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testMessage, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

/** Renders the general channel with one message and returns its list item. */
const showMessage = async (content: string) => {
  const api = createFakeApi({ user: testUser })
  api.messages.list.mockResolvedValue({ messages: [testMessage('1001', { content })] })
  const rendered = renderApp(`/channels/${testGuild.id}/503`, { api })
  const item = await waitFor(() => {
    const found = document.querySelector<HTMLElement>('[data-message-id="1001"]')
    if (!found) throw new Error('Message not rendered yet')
    return found
  })
  return { ...rendered, item }
}

describe('message markdown', () => {
  it('renders styles as elements, never as HTML', async () => {
    const { item } = await showMessage(
      '**bold** *it* __u__ ~~s~~ `x<b>y</b>` <img src=x onerror=alert(1)>',
    )

    expect(within(item).getByText('bold').tagName).toBe('STRONG')
    expect(within(item).getByText('it').tagName).toBe('EM')
    expect(within(item).getByText('u').tagName).toBe('U')
    expect(within(item).getByText('s').tagName).toBe('S')
    expect(within(item).getByText('x<b>y</b>').tagName).toBe('CODE')
    expect(item.querySelector('img[src="x"]')).toBeNull()
    expect(within(item).getByText(/<img src=x onerror=alert\(1\)>/)).toBeVisible()
  })

  it('opens http(s) links in a new tab without leaking the opener', async () => {
    const { item } = await showMessage('see https://example.com/page and javascript:alert(1)')

    const link = within(item).getByRole('link', { name: 'https://example.com/page' })
    expect(link).toHaveAttribute('href', 'https://example.com/page')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc')
    expect(within(item).queryByRole('link', { name: /javascript/ })).toBeNull()
  })

  it('shows mentions by name and links channel mentions', async () => {
    const { item, user, router } = await showMessage(
      `<@200> <@&510> <#503> @everyone <@999> <#888>`,
    )

    expect(await within(item).findByText('@Боб')).toBeVisible()
    expect(within(item).getByText('@Модераторы')).toBeVisible()
    expect(within(item).getByText('@everyone')).toBeVisible()
    expect(within(item).getByText('@неизвестный')).toBeVisible()
    expect(within(item).getByText('#неизвестный-канал')).toBeVisible()

    await user.click(within(item).getByRole('link', { name: '#общий' }))
    expect(router.state.location.pathname).toBe(`/channels/${testGuild.id}/503`)
  })

  it('hides spoilers until clicked', async () => {
    const { item, user } = await showMessage('the end: ||they win||')

    const spoiler = within(item).getByRole('button', { name: 'Показать спойлер' })
    expect(within(spoiler).getByText('they win')).toHaveAttribute('inert')

    await user.click(spoiler)

    expect(within(item).queryByRole('button', { name: 'Показать спойлер' })).toBeNull()
    expect(within(item).getByText('they win')).not.toHaveAttribute('inert')
  })

  it('keeps links and mentions inside a hidden spoiler out of reach', async () => {
    const { item, user } = await showMessage('||<@200> https://evil.test||')

    const hidden = within(item).getByText('@Боб').parentElement as HTMLElement
    expect(hidden).toHaveAttribute('inert')
    // jsdom does not apply inert to queries; browsers drop it from focus and the a11y tree.
    expect(within(item).getByRole('link').closest('[inert]')).not.toBeNull()

    await user.click(within(item).getByRole('button', { name: 'Показать спойлер' }))
    expect(within(item).getByRole('link', { name: 'https://evil.test' })).toBeVisible()
  })

  it('renders code blocks and quotes', async () => {
    const { item } = await showMessage('> wise words\n```ts\nconst a = **1**\n```')

    expect(within(item).getByText('wise words').closest('blockquote')).not.toBeNull()
    const code = within(item).getByText('const a = **1**')
    expect(code.tagName).toBe('CODE')
    expect(code.closest('pre')).not.toBeNull()
    expect(code).toHaveAttribute('data-lang', 'ts')
  })

  it('shows messages of only emoji large', async () => {
    const { item } = await showMessage('🎉🎉')
    expect(within(item).getAllByText('🎉')[0]?.closest('[data-jumbo]')).not.toBeNull()
  })

  it('keeps line breaks', async () => {
    const { item } = await showMessage('one\ntwo')
    expect(item.querySelector('br')).not.toBeNull()
  })
})
