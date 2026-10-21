import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFakeApi, testFriend, testMessage, testUser } from '../../test/fake-api'
import { fakeCiphertext } from '../../test/fake-e2ee'
import { fakeAudioDecoding, WEBM_BYTES } from '../../test/fake-media'
import { renderApp } from '../../test/render-app'
import { encryptFile } from './file-crypto'

import type { Attachment, PrivateChannel } from '@chinchi/shared'

const encryptedDm: PrivateChannel = {
  id: '802',
  type: 'dm',
  name: null,
  ownerId: null,
  recipients: [testFriend],
  lastMessageId: '1301',
  encrypted: true,
}
const URL_PATH = `/channels/@me/${encryptedDm.id}`
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])

/** How the server lists an encrypted file: a generic name, the ciphertext's size. */
const stored = (id: string, size: number): Attachment => ({
  id,
  filename: 'encrypted',
  size,
  contentType: 'application/octet-stream',
  url: `/api/v1/attachments/${id}/encrypted`,
  width: null,
  height: null,
  previewUrl: null,
})

beforeEach(() => {
  vi.stubGlobal(
    'URL',
    Object.assign(globalThis.URL, {
      createObjectURL: vi.fn(() => 'blob:decrypted'),
      revokeObjectURL: vi.fn(),
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('files in encrypted conversations', () => {
  it('are encrypted before upload; the name and key travel inside the message', async () => {
    const api = createFakeApi({ user: testUser })
    api.dms.list.mockResolvedValue({ channels: [encryptedDm] })
    const { user, e2ee } = renderApp(URL_PATH, { api })
    const plan = new File(['секретный план'], 'план.txt', { type: 'text/plain' })

    await user.upload(await screen.findByLabelText('Прикрепить файлы'), plan)
    await user.type(await screen.findByRole('textbox', { name: 'Написать @Боб' }), '{Enter}')

    await waitFor(() => expect(e2ee.send).toHaveBeenCalled())
    const [channelId, blob, options] = api.attachments.upload.mock.calls[0] as unknown as [
      string,
      Blob,
      object,
    ]
    expect(channelId).toBe(encryptedDm.id)
    expect(blob).not.toBe(plan)
    expect(blob.size).toBe(plan.size + 16)
    expect(options).toEqual({
      filename: 'encrypted',
      contentType: 'application/octet-stream',
      onProgress: expect.any(Function),
    })
    expect(e2ee.send).toHaveBeenCalledWith(expect.objectContaining({ id: encryptedDm.id }), '', {
      nonce: expect.any(String),
      files: [
        expect.objectContaining({
          id: '900',
          name: 'план.txt',
          type: 'text/plain',
          size: plan.size,
        }),
      ],
    })
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Файлы к отправке' })).not.toBeInTheDocument(),
    )
  })

  it('show the message at once, with the upload going, before it is sent', async () => {
    const api = createFakeApi({ user: testUser })
    api.dms.list.mockResolvedValue({ channels: [encryptedDm] })
    let release: () => void = () => {}
    api.attachments.upload.mockImplementationOnce(async (_channel, _file, options) => {
      options?.onProgress?.(10, 40)
      await new Promise<void>((resolve) => (release = resolve))
      return '900'
    })
    const { user, e2ee } = renderApp(URL_PATH, { api })
    const plan = new File(['секретный план'], 'план.txt', { type: 'text/plain' })

    await user.upload(await screen.findByLabelText('Прикрепить файлы'), plan)
    await user.type(await screen.findByRole('textbox', { name: 'Написать @Боб' }), 'держи{Enter}')

    const sending = (await screen.findByText('держи')).closest('li') as HTMLElement
    expect(
      await within(sending).findByRole('progressbar', { name: 'Загрузка файлов' }),
    ).toHaveAttribute('aria-valuenow', '25')
    expect(e2ee.send).not.toHaveBeenCalled()
    release()
    await waitFor(() => expect(e2ee.send).toHaveBeenCalled())
  })

  it('are decrypted here: images show, other files download under their real name', async () => {
    const image = await encryptFile(new File([PNG], 'кот.png', { type: 'image/png' }))
    const doc = await encryptFile(new File(['отчёт'], 'отчёт.pdf', { type: 'application/pdf' }))
    // jsdom's Blob is not one Node's Response reads: hand it the bytes.
    const imageBytes = new Uint8Array(await image.blob.arrayBuffer())
    const docBytes = new Uint8Array(await doc.blob.arrayBuffer())
    const fetchMock = vi.fn(
      async (url: string) => new Response(url.includes('/901/') ? imageBytes : docBytes),
    )
    vi.stubGlobal('fetch', fetchMock)
    const api = createFakeApi({ user: testUser })
    api.dms.list.mockResolvedValue({ channels: [encryptedDm] })
    api.messages.list.mockResolvedValue({
      messages: [
        testMessage('1301', {
          channelId: encryptedDm.id,
          guildId: null,
          content: '',
          ciphertext: fakeCiphertext('Держи', [
            { id: '901', ...image.file },
            { id: '902', ...doc.file },
          ]),
          attachments: [stored('901', image.blob.size), stored('902', doc.blob.size)],
        }),
      ],
    })
    renderApp(URL_PATH, { api })

    expect(await screen.findByText('Держи')).toBeVisible()
    expect(await screen.findByRole('img', { name: 'кот.png' })).toHaveAttribute(
      'src',
      'blob:decrypted',
    )
    expect(screen.getByRole('button', { name: /^отчёт\.pdf/ })).toBeVisible()
    // The generic names the server knows never show.
    expect(screen.queryByText('encrypted')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/attachments/901/encrypted')
  })

  it('say so when a file cannot be opened', async () => {
    const image = await encryptFile(new File([PNG], 'кот.png', { type: 'image/png' }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array(40))),
    )
    const api = createFakeApi({ user: testUser })
    api.dms.list.mockResolvedValue({ channels: [encryptedDm] })
    api.messages.list.mockResolvedValue({
      messages: [
        testMessage('1301', {
          channelId: encryptedDm.id,
          guildId: null,
          content: '',
          ciphertext: fakeCiphertext('', [{ id: '901', ...image.file }]),
          attachments: [stored('901', 40)],
        }),
      ],
    })
    renderApp(URL_PATH, { api })

    expect(await screen.findByText(/Не удалось расшифровать файл кот\.png/)).toBeVisible()
  })
  it('play voice messages decrypted on this device, only if they are audio', async () => {
    fakeAudioDecoding()
    const voice = await encryptFile(new File([WEBM_BYTES], 'voice.webm', { type: 'audio/webm' }))
    const fake = await encryptFile(new File(['<html>'], 'fake.webm', { type: 'audio/webm' }))
    const voiceBytes = new Uint8Array(await voice.blob.arrayBuffer())
    const fakeBytes = new Uint8Array(await fake.blob.arrayBuffer())
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => new Response(url.includes('/901/') ? voiceBytes : fakeBytes)),
    )
    const api = createFakeApi({ user: testUser })
    api.dms.list.mockResolvedValue({ channels: [encryptedDm] })
    api.messages.list.mockResolvedValue({
      messages: [
        testMessage('1301', {
          channelId: encryptedDm.id,
          guildId: null,
          content: '',
          ciphertext: fakeCiphertext('Послушай', [
            { id: '901', ...voice.file },
            { id: '902', ...fake.file },
          ]),
          attachments: [stored('901', voice.blob.size), stored('902', fake.blob.size)],
        }),
      ],
    })
    renderApp(URL_PATH, { api })

    expect(
      await screen.findByRole('button', { name: 'Воспроизвести голосовое, 0:42' }),
    ).toBeEnabled()
    expect(await screen.findByText('Не удалось открыть голосовое fake.webm')).toBeVisible()
  })

  it('show how far a download got and can be cancelled', async () => {
    const doc = await encryptFile(new File(['отчёт'], 'отчёт.pdf', { type: 'application/pdf' }))
    const api = createFakeApi({ user: testUser })
    api.dms.list.mockResolvedValue({ channels: [encryptedDm] })
    api.messages.list.mockResolvedValue({
      messages: [sealedMessage([{ id: '902', ...doc.file }], [stored('902', doc.blob.size)])],
    })
    let signal: AbortSignal | undefined
    // Never settles, even when cancelled: decrypting cannot be stopped midway either.
    api.media.download.mockImplementation((_path, options) => {
      signal = options?.signal
      options?.onProgress?.(10, 40)
      return new Promise<Blob>(() => {})
    })
    const { user } = renderApp(URL_PATH, { api })

    await user.click(await screen.findByRole('button', { name: /^отчёт\.pdf/ }))

    expect(await screen.findByRole('progressbar', { name: 'Загрузка отчёт.pdf' })).toHaveAttribute(
      'aria-valuenow',
      '25',
    )
    expect(screen.getByText(/^Загрузка 25 %/)).toBeVisible()
    const cancel = screen.getByRole('button', { name: 'Отменить загрузку отчёт.pdf' })
    expect(cancel).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(signal?.aborted).toBe(true)
    const file = screen.getByRole('button', { name: /^отчёт\.pdf/ })
    expect(file).toHaveFocus()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // Started again, it starts from nothing.
    api.media.download.mockImplementation(() => new Promise<Blob>(() => {}))
    await user.click(file)
    expect(await screen.findByRole('progressbar', { name: 'Загрузка отчёт.pdf' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    )
    expect(api.media.download).toHaveBeenCalledTimes(2)
  })

  it('say they are decrypting once the whole file is here', async () => {
    const doc = await encryptFile(new File(['отчёт'], 'отчёт.pdf', { type: 'application/pdf' }))
    const api = createFakeApi({ user: testUser })
    api.dms.list.mockResolvedValue({ channels: [encryptedDm] })
    api.messages.list.mockResolvedValue({
      messages: [sealedMessage([{ id: '902', ...doc.file }], [stored('902', doc.blob.size)])],
    })
    api.media.download.mockImplementation((_path, options) => {
      options?.onProgress?.(40, 40)
      return new Promise<Blob>(() => {})
    })
    const { user } = renderApp(URL_PATH, { api })

    await user.click(await screen.findByRole('button', { name: /^отчёт\.pdf/ }))

    expect(await screen.findByText('Расшифровка…')).toBeVisible()
  })

  it('let an image that is still loading be stopped; it then waits for a click', async () => {
    const image = await encryptFile(new File([PNG], 'кот.png', { type: 'image/png' }))
    const api = createFakeApi({ user: testUser })
    api.dms.list.mockResolvedValue({ channels: [encryptedDm] })
    api.messages.list.mockResolvedValue({
      messages: [sealedMessage([{ id: '901', ...image.file }], [stored('901', image.blob.size)])],
    })
    let signal: AbortSignal | undefined
    api.media.download.mockImplementation(
      (_path, options) =>
        new Promise<Blob>((_resolve, reject) => {
          signal = options?.signal
          options?.onProgress?.(5, null)
          signal?.addEventListener('abort', () => reject(signal?.reason))
        }),
    )
    const { user } = renderApp(URL_PATH, { api })

    expect(await screen.findByRole('progressbar', { name: 'Загрузка кот.png' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Отменить загрузку кот.png' }))

    expect(signal?.aborted).toBe(true)
    expect(await screen.findByRole('button', { name: /^кот\.png/ })).toHaveFocus()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

const sealedMessage = (files: Parameters<typeof fakeCiphertext>[1], attachments: Attachment[]) =>
  testMessage('1301', {
    channelId: encryptedDm.id,
    guildId: null,
    content: '',
    ciphertext: fakeCiphertext('', files),
    attachments,
  })
