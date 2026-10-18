import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const CHANNEL_URL = `/channels/${testGuild.id}/503`
const composer = () => screen.findByRole('textbox', { name: 'Сообщение в #общий' })

const withUploads = () => {
  const api = createFakeApi({ user: testUser })
  api.instance.get.mockResolvedValue({
    instance: {
      name: 'Chinchi',
      registrationMode: 'open',
      uploads: { maxBytes: 25 * 1024 * 1024, maxAttachments: 10 },
      voice: false,
      requireVerifiedEmail: false,
    },
  })
  return api
}

describe('the composer', () => {
  it('offers a file or a poll from its "+" menu', async () => {
    const { user } = renderApp(CHANNEL_URL, { api: withUploads() })

    await user.click(await screen.findByRole('button', { name: 'Добавить в сообщение' }))
    expect(await screen.findByRole('menuitem', { name: /Файл или фото/ })).toHaveTextContent(
      'До 25 МБ',
    )
    await user.click(screen.getByRole('menuitem', { name: /Опрос/ }))

    expect(await screen.findByRole('dialog', { name: 'Новый опрос' })).toBeVisible()
  })

  it('sends with its button as well as with Enter', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(CHANNEL_URL, { api })

    await user.type(await composer(), 'Привет')
    await user.click(screen.getByRole('button', { name: 'Отправить сообщение' }))

    await waitFor(() =>
      expect(api.messages.create).toHaveBeenCalledWith(
        '503',
        expect.objectContaining({ content: 'Привет' }),
      ),
    )
  })
})
