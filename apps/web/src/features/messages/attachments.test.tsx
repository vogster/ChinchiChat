import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testMessage, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { Attachment } from '@chinchi/shared'

const IMAGE: Attachment = {
  id: '901',
  filename: 'cat.png',
  size: 120_000,
  contentType: 'image/png',
  url: '/api/v1/attachments/901/cat.png',
  width: 1200,
  height: 600,
  previewUrl: '/api/v1/attachments/901/preview/cat.webp',
}

const FILE: Attachment = {
  id: '902',
  filename: 'report.pdf',
  size: 2_500_000,
  contentType: 'application/pdf',
  url: '/api/v1/attachments/902/report.pdf',
  width: null,
  height: null,
  previewUrl: null,
}

const showWith = async (attachments: Attachment[]) => {
  const api = createFakeApi({ user: testUser })
  api.messages.list.mockResolvedValue({
    messages: [testMessage('1001', { content: 'файлы', attachments })],
  })
  const rendered = renderApp(`/channels/${testGuild.id}/503`, { api })
  const item = (await screen.findByText('файлы')).closest('li') as HTMLElement
  return { ...rendered, item }
}

describe('attachments in messages', () => {
  it('shows images by their preview, sized to avoid layout jumps', async () => {
    const { item } = await showWith([IMAGE])

    const button = within(item).getByRole('button', { name: 'Открыть изображение cat.png' })
    const image = within(button).getByRole('img', { name: 'cat.png' })
    expect(image).toHaveAttribute('src', IMAGE.previewUrl)
    expect(image).toHaveAttribute('width', '400')
    expect(image).toHaveAttribute('height', '200')
  })

  it('falls back to the original while the preview is not ready', async () => {
    const { item } = await showWith([{ ...IMAGE, previewUrl: null, width: null, height: null }])
    expect(within(item).getByRole('img', { name: 'cat.png' })).toHaveAttribute('src', IMAGE.url)
  })

  it('opens images in a viewer with the original', async () => {
    const { item, user } = await showWith([IMAGE])

    await user.click(within(item).getByRole('button', { name: 'Открыть изображение cat.png' }))

    const viewer = await screen.findByRole('dialog', { name: 'cat.png' })
    expect(within(viewer).getByRole('img', { name: 'cat.png' })).toHaveAttribute('src', IMAGE.url)
    const original = within(viewer).getByRole('link', { name: 'Открыть оригинал' })
    expect(original).toHaveAttribute('href', IMAGE.url)
    expect(original).toHaveAttribute('target', '_blank')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows other files as a download with their size', async () => {
    const { item } = await showWith([FILE])

    const link = within(item).getByRole('link', { name: 'report.pdf (2,4 МБ)' })
    expect(link).toHaveAttribute('href', FILE.url)
    expect(link).toHaveAttribute('download', 'report.pdf')
  })
})
