import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testHistory, testMessage, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const GENERAL_URL = `/channels/${testGuild.id}/503`
const cat = { id: '600', name: 'cat', url: '/api/v1/emojis/600.webp', animated: false }
const dance = { id: '602', name: 'dance', url: '/api/v1/emojis/602.webp', animated: true }

const withEmoji = () => {
  const api = createFakeApi({ user: testUser })
  api.guilds.get.mockResolvedValue({ guild: { ...testGuild, emojis: [cat] } })
  return api
}

describe('server emoji', () => {
  it('show as pictures in messages and reactions', async () => {
    const api = withEmoji()
    api.messages.list.mockResolvedValue({
      messages: [
        ...testHistory,
        testMessage('1004', {
          content: 'смотри <:cat:600>',
          reactions: [{ emoji: '<:cat:600>', count: 2, me: false }],
        }),
      ],
    })
    renderApp(GENERAL_URL, { api })

    const row = (await screen.findByText(/смотри/)).closest('li') as HTMLElement
    const images = within(row).getAllByRole('img', { name: ':cat:' })
    expect(images[0]).toHaveAttribute('src', '/api/v1/emojis/600.webp')
    expect(within(row).getByRole('button', { name: /:cat:.*2/ })).toBeVisible()
  })

  it('turn :name: into the emoji when sending, and come from the picker', async () => {
    const api = withEmoji()
    const { user } = renderApp(GENERAL_URL, { api })

    const composer = await screen.findByRole('textbox', { name: 'Сообщение в #общий' })
    await user.type(composer, 'привет :cat: и :dog:{Enter}')
    await waitFor(() =>
      expect(api.messages.create).toHaveBeenCalledWith(
        '503',
        expect.objectContaining({ content: 'привет <:cat:600> и :dog:' }),
      ),
    )

    await user.click(screen.getAllByRole('button', { name: 'Эмодзи' }).at(-1) as HTMLElement)
    const picker = await screen.findByRole('dialog', { name: 'Эмодзи' })
    await user.click(within(picker).getByRole('button', { name: ':cat:' }))
    expect(composer).toHaveValue('<:cat:600>')
  })

  it('are managed in the server settings', async () => {
    const api = withEmoji()
    api.emojis.create.mockResolvedValue({
      emoji: { id: '601', name: 'party', url: '/api/v1/emojis/601.webp', animated: false },
    })
    const { user } = renderApp(`/server-settings/${testGuild.id}/emojis`, { api })

    const list = await screen.findByRole('list', { name: 'Эмодзи сервера' })
    expect(within(list).getByText(':cat:')).toBeVisible()

    await user.type(screen.getByLabelText('Название', { exact: true }), 'party')
    const file = new File([new Uint8Array([1, 2, 3])], 'party.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('Загрузить эмодзи'), file)
    await waitFor(() => expect(api.emojis.create).toHaveBeenCalledWith(testGuild.id, 'party', file))

    await user.click(within(list).getByRole('button', { name: 'Удалить :cat:' }))
    await waitFor(() => expect(api.emojis.delete).toHaveBeenCalledWith(testGuild.id, '600'))
  })

  it('keep animated ones animated: written <a:name:id>, marked in the settings', async () => {
    const api = createFakeApi({ user: testUser })
    api.guilds.get.mockResolvedValue({ guild: { ...testGuild, emojis: [cat, dance] } })
    const { user } = renderApp(GENERAL_URL, { api })

    const composer = await screen.findByRole('textbox', { name: 'Сообщение в #общий' })
    await user.type(composer, ':dance:{Enter}')
    await waitFor(() =>
      expect(api.messages.create).toHaveBeenCalledWith(
        '503',
        expect.objectContaining({ content: '<a:dance:602>' }),
      ),
    )

    renderApp(`/server-settings/${testGuild.id}/emojis`, { api })
    const list = await screen.findByRole('list', { name: 'Эмодзи сервера' })
    const row = within(list).getByText(':dance:').closest('li') as HTMLElement
    expect(within(row).getByText('GIF')).toBeVisible()
    const still = within(list).getByText(':cat:').closest('li') as HTMLElement
    expect(within(still).queryByText('GIF')).toBeNull()
  })
})
