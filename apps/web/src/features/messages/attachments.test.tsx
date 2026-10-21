import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('in the desktop, fetches pictures and files through the API with the session', async () => {
    const api = createFakeApi({ user: testUser })
    api.messages.list.mockResolvedValue({
      messages: [testMessage('1001', { content: 'файлы', attachments: [IMAGE, FILE] })],
    })
    api.media.download.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const { user } = renderApp(`/channels/${testGuild.id}/503`, {
      api,
      mediaBase: 'https://chat.example.com',
    })
    const item = (await screen.findByText('файлы')).closest('li') as HTMLElement

    const image = within(item).getByRole('img', { name: 'cat.png' })
    await waitFor(() => expect(image).toHaveAttribute('src', 'blob:preview'))
    expect(api.media.download).toHaveBeenCalledWith(IMAGE.previewUrl)

    // The file link points at the server for the browser, but the click goes through the API.
    const link = within(item).getByRole('link', { name: /report\.pdf/ })
    expect(link).toHaveAttribute('href', `https://chat.example.com${FILE.url}`)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await user.click(link)
    await waitFor(() => expect(api.media.download).toHaveBeenCalledWith(FILE.url))
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(fetchMock).not.toHaveBeenCalled()
  })

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

  it('downloads the original from the viewer under its own name', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(new Blob(['png']), { status: 200 }))
    const saved: string[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download)
    })
    const { item, user } = await showWith([IMAGE])
    await user.click(within(item).getByRole('button', { name: 'Открыть изображение cat.png' }))

    const viewer = await screen.findByRole('dialog', { name: 'cat.png' })
    await user.click(within(viewer).getByRole('button', { name: 'Скачать' }))

    await waitFor(() => expect(saved).toEqual(['cat.png']))
    expect(fetchMock).toHaveBeenCalledWith(IMAGE.url)
    fetchMock.mockRestore()
    click.mockRestore()
  })

  it('says so when the download from the viewer fails', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
    const { item, user } = await showWith([IMAGE])
    await user.click(within(item).getByRole('button', { name: 'Открыть изображение cat.png' }))

    const viewer = await screen.findByRole('dialog', { name: 'cat.png' })
    await user.click(within(viewer).getByRole('button', { name: 'Скачать' }))

    expect(await within(viewer).findByRole('alert')).toHaveTextContent('Не удалось скачать')
    fetchMock.mockRestore()
  })

  it('shows other files as a download with their size', async () => {
    const { item } = await showWith([FILE])

    const link = within(item).getByRole('link', { name: 'report.pdf (2,4 МБ)' })
    expect(link).toHaveAttribute('href', FILE.url)
    expect(link).toHaveAttribute('download', 'report.pdf')
  })
})
