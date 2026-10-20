import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createFakeApi, testGuild, testMessage, testUser } from '../../test/fake-api'
import {
  fakeAudioDecoding,
  fakeMediaPlayback,
  fakeMicrophone,
  WEBM_BYTES,
} from '../../test/fake-media'
import { renderApp } from '../../test/render-app'

import type { Attachment } from '@chinchi/shared'

const CHANNEL_URL = `/channels/${testGuild.id}/503`
const composer = () => screen.findByRole('textbox', { name: 'Сообщение в #общий' })

const voice = (id: string, filename = `voice-${id}.webm`): Attachment => ({
  id,
  filename,
  size: WEBM_BYTES.length,
  contentType: 'audio/webm',
  url: `/api/v1/attachments/${id}/${filename}`,
  width: null,
  height: null,
  previewUrl: null,
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('recording a voice message', () => {
  it('swaps the send button for the microphone while the composer is empty', async () => {
    fakeMicrophone()
    const { user } = renderApp(CHANNEL_URL, { api: createFakeApi({ user: testUser }) })

    expect(await screen.findByRole('button', { name: 'Записать голосовое' })).toBeVisible()
    await user.type(await composer(), 'привет')
    expect(screen.queryByRole('button', { name: 'Записать голосовое' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Отправить сообщение' })).toBeVisible()
  })

  it('records and sends the voice message as a file', async () => {
    const { stopTrack } = fakeMicrophone()
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(CHANNEL_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Записать голосовое' }))
    const recording = await screen.findByRole('group', { name: 'Запись голосового' })
    expect(within(recording).getByText('0:00')).toBeVisible()
    await user.click(within(recording).getByRole('button', { name: 'Отправить голосовое' }))

    await waitFor(() => expect(api.attachments.upload).toHaveBeenCalled())
    const sent = api.attachments.upload.mock.calls[0]?.[1] as File
    expect(sent.name).toMatch(/^voice-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.webm$/)
    expect(sent.type).toBe('audio/webm')
    await waitFor(() =>
      expect(api.messages.create).toHaveBeenCalledWith(
        '503',
        expect.objectContaining({ content: '', attachmentIds: ['900'] }),
      ),
    )
    // The microphone is let go, and the composer is back.
    expect(stopTrack).toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: 'Запись голосового' })).toBeNull()
    expect(await composer()).toBeVisible()
  })

  it('throws the recording away on cancel or Esc', async () => {
    const { stopTrack } = fakeMicrophone()
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(CHANNEL_URL, { api })

    await user.click(await screen.findByRole('button', { name: 'Записать голосовое' }))
    await user.click(await screen.findByRole('button', { name: 'Отменить запись' }))
    expect(screen.queryByRole('group', { name: 'Запись голосового' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Записать голосовое' }))
    await screen.findByRole('group', { name: 'Запись голосового' })
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('group', { name: 'Запись голосового' })).toBeNull()
    expect(stopTrack).toHaveBeenCalledTimes(2)
    expect(api.attachments.upload).not.toHaveBeenCalled()
  })

  it('says so when the microphone is not allowed', async () => {
    fakeMicrophone({ deny: true })
    const { user } = renderApp(CHANNEL_URL, { api: createFakeApi({ user: testUser }) })

    await user.click(await screen.findByRole('button', { name: 'Записать голосовое' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Нет доступа к микрофону')
  })

  it('offers no microphone where the browser cannot record', async () => {
    renderApp(CHANNEL_URL, { api: createFakeApi({ user: testUser }) })

    expect(await screen.findByRole('button', { name: 'Отправить сообщение' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Записать голосовое' })).toBeNull()
  })
})

describe('playing a voice message', () => {
  const showWith = async (attachments: Attachment[]) => {
    fakeAudioDecoding()
    fakeMediaPlayback()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Blob([WEBM_BYTES], { type: 'audio/webm' }))),
    )
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:voice')
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)
    const api = createFakeApi({ user: testUser })
    api.messages.list.mockResolvedValue({
      messages: [testMessage('1001', { content: 'послушай', attachments })],
    })
    const rendered = renderApp(CHANNEL_URL, { api })
    const item = (await screen.findByText('послушай')).closest('li') as HTMLElement
    return { ...rendered, item }
  }

  it('shows a player with the length and seeks along the waveform', async () => {
    const { item, user } = await showWith([voice('901')])

    const play = await within(item).findByRole('button', {
      name: 'Воспроизвести голосовое, 0:42',
    })
    expect(within(item).getByText('0:42')).toBeVisible()
    await user.click(play)
    expect(within(item).getByRole('button', { name: 'Пауза' })).toBeVisible()

    const position = within(item).getByRole('slider', { name: 'Позиция в голосовом' })
    expect(position).toHaveAttribute('aria-valuemax', '42')
    fireEvent.keyDown(position, { key: 'ArrowRight' })
    expect(position).toHaveAttribute('aria-valuetext', '0:05 из 0:42')
    fireEvent.keyDown(position, { key: 'End' })
    expect(position).toHaveAttribute('aria-valuenow', '42')
  })

  it('plays one voice message at a time', async () => {
    const { item, user } = await showWith([voice('901'), voice('902')])

    const [first, second] = await within(item).findAllByRole('button', {
      name: 'Воспроизвести голосовое, 0:42',
    })
    await user.click(first as HTMLElement)
    await user.click(second as HTMLElement)

    expect(within(item).getAllByRole('button', { name: 'Пауза' })).toHaveLength(1)
    expect(
      within(item).getAllByRole('button', { name: 'Воспроизвести голосовое, 0:42' }),
    ).toHaveLength(1)
  })
})
