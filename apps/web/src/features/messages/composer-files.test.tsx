import { Permission } from '@chinchi/shared'
import { createEvent, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const CHANNEL_URL = `/channels/${testGuild.id}/503`
const composer = () => screen.findByRole('textbox', { name: 'Сообщение в #общий' })
const file = (name = 'cat.png', size = 10, type = 'image/png') =>
  new File([new Uint8Array(size)], name, { type })

describe('attaching files', () => {
  it('attaches files and sends them, even without text', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(CHANNEL_URL, { api })
    const cat = file()

    await user.upload(await screen.findByLabelText('Прикрепить файлы'), cat)
    const pending = screen.getByRole('list', { name: 'Файлы к отправке' })
    expect(within(pending).getByText('cat.png')).toBeVisible()

    await user.type(await composer(), '{Enter}')

    await waitFor(() =>
      expect(api.attachments.upload).toHaveBeenCalledWith('503', cat, {
        onProgress: expect.any(Function),
      }),
    )
    await waitFor(() =>
      expect(api.messages.create).toHaveBeenCalledWith(
        '503',
        expect.objectContaining({ content: '', attachmentIds: ['900'] }),
      ),
    )
    expect(screen.queryByRole('list', { name: 'Файлы к отправке' })).toBeNull()
  })

  it('retries a failed message with its files', async () => {
    const api = createFakeApi({ user: testUser })
    api.messages.create.mockRejectedValueOnce(new Error('offline'))
    const { user } = renderApp(CHANNEL_URL, { api })
    const cat = file()

    await user.upload(await screen.findByLabelText('Прикрепить файлы'), cat)
    await user.type(await composer(), 'смотрите{Enter}')
    const failed = (await screen.findByText('смотрите')).closest('li') as HTMLElement
    expect(within(failed).getByText('cat.png')).toBeVisible()
    await user.click(await within(failed).findByRole('button', { name: 'Повторить' }))

    await waitFor(() => expect(api.messages.create).toHaveBeenCalledTimes(2))
    expect(api.attachments.upload).toHaveBeenLastCalledWith('503', cat, {
      onProgress: expect.any(Function),
    })
    expect(api.messages.create).toHaveBeenLastCalledWith(
      '503',
      expect.objectContaining({ content: 'смотрите', attachmentIds: ['900'] }),
    )
  })

  it('shows how far the files have gone up while the message waits', async () => {
    const api = createFakeApi({ user: testUser })
    let release: () => void = () => {}
    api.attachments.upload.mockImplementationOnce(async (_channel, _file, options) => {
      options?.onProgress?.(5, 10)
      await new Promise<void>((resolve) => (release = resolve))
      return '900'
    })
    const { user } = renderApp(CHANNEL_URL, { api })

    await user.upload(await screen.findByLabelText('Прикрепить файлы'), file('cat.png', 10))
    await user.type(await composer(), 'смотрите{Enter}')

    const sending = (await screen.findByText('смотрите')).closest('li') as HTMLElement
    const bar = await within(sending).findByRole('progressbar', { name: 'Загрузка файлов' })
    expect(bar).toHaveAttribute('aria-valuenow', '50')
    expect(within(sending).getByText(/50 %/)).toBeVisible()
    // One pill with the file and its progress, not a second one with the name.
    expect(within(sending).getAllByText('cat.png')).toHaveLength(1)

    release()
    await waitFor(() => expect(api.messages.create).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull())
  })

  it('removes a file before sending', async () => {
    const { user } = renderApp(CHANNEL_URL, { user: testUser })
    await user.upload(await screen.findByLabelText('Прикрепить файлы'), file())

    await user.click(screen.getByRole('button', { name: 'Убрать cat.png' }))

    expect(screen.queryByRole('list', { name: 'Файлы к отправке' })).toBeNull()
  })

  it('refuses files over the limit and more files than allowed', async () => {
    const api = createFakeApi({ user: testUser })
    api.instance.get.mockResolvedValue({
      instance: {
        name: 'Chinchi',
        registrationMode: 'open',
        uploads: { maxBytes: 100, maxAttachments: 2 },
        voice: false,
        requireVerifiedEmail: false,
      },
    })
    const { user } = renderApp(CHANNEL_URL, { api })
    const input = await screen.findByLabelText('Прикрепить файлы')

    await user.upload(input, file('big.bin', 101, 'application/octet-stream'))
    expect(
      await screen.findByText('Файл big.bin больше допустимого размера (100 Б).'),
    ).toBeVisible()

    await user.upload(input, [file('a.png'), file('b.png'), file('c.png')])
    expect(await screen.findByText('Можно прикрепить не больше 2 файлов.')).toBeVisible()
    expect(
      within(screen.getByRole('list', { name: 'Файлы к отправке' })).getAllByRole('listitem'),
    ).toHaveLength(2)
  })

  it('takes files dropped on the channel and pasted into the composer', async () => {
    renderApp(CHANNEL_URL, { user: testUser })
    // Attaching is on once the instance's upload limits are known.
    await screen.findByLabelText('Прикрепить файлы')
    const box = await composer()

    fireEvent.drop(box.closest('section') as HTMLElement, {
      dataTransfer: { files: [file('dropped.png')], types: ['Files'] },
    })
    const paste = createEvent.paste(box, { clipboardData: { files: [file('pasted.png')] } })
    fireEvent(box, paste)

    const pending = await screen.findByRole('list', { name: 'Файлы к отправке' })
    expect(within(pending).getByText('dropped.png')).toBeVisible()
    expect(within(pending).getByText('pasted.png')).toBeVisible()
  })

  it('hides attaching without ATTACH_FILES', async () => {
    const api = createFakeApi({ user: { ...testUser, id: '999', username: 'carol' } })
    api.guilds.get.mockResolvedValue({
      guild: {
        ...testGuild,
        ownerId: '200',
        roles: testGuild.roles.map((role) =>
          role.id === testGuild.id
            ? { ...role, permissions: String(BigInt(role.permissions) & ~Permission.AttachFiles) }
            : role,
        ),
      },
    })
    renderApp(CHANNEL_URL, { api })

    await composer()
    expect(screen.queryByLabelText('Прикрепить файлы')).toBeNull()
  })
})
