import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFakeApi, testFriend, testMessage, testUser } from '../../test/fake-api'
import { fakeCiphertext } from '../../test/fake-e2ee'
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
    expect(options).toEqual({ filename: 'encrypted', contentType: 'application/octet-stream' })
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
})
