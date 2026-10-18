import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testUser } from '../../test/fake-api'
import { openMessageMenu } from '../../test/message-menu'
import { renderApp } from '../../test/render-app'

const CHANNEL_URL = `/channels/${testGuild.id}/503`
const composer = () => screen.findByRole('textbox', { name: 'Сообщение в #общий' })

afterEach(() => {
  localStorage.clear()
})

describe('emoji picker', () => {
  it('finds emoji by Russian words and inserts them into the composer', async () => {
    const { user } = renderApp(CHANNEL_URL, { user: testUser })
    const box = await composer()
    await user.type(box, 'ну ')

    await user.click(screen.getByRole('button', { name: 'Эмодзи' }))
    const picker = await screen.findByRole('dialog', { name: 'Эмодзи' })
    await user.type(within(picker).getByRole('searchbox', { name: 'Поиск эмодзи' }), 'ржака')
    await user.click(await within(picker).findByRole('button', { name: '😂 смеется до слез' }))

    expect(box).toHaveValue('ну 😂')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Эмодзи' })).toBeNull())
  })

  it('keeps the emoji you use at hand', async () => {
    const { user } = renderApp(CHANNEL_URL, { user: testUser })
    await composer()
    await user.click(screen.getByRole('button', { name: 'Эмодзи' }))
    let picker = await screen.findByRole('dialog', { name: 'Эмодзи' })
    await user.type(within(picker).getByRole('searchbox', { name: 'Поиск эмодзи' }), 'ржака')
    await user.click(await within(picker).findByRole('button', { name: '😂 смеется до слез' }))

    await user.click(screen.getByRole('button', { name: 'Эмодзи' }))
    picker = await screen.findByRole('dialog', { name: 'Эмодзи' })
    const recent = within(picker).getByRole('region', { name: 'Часто используемые' })
    expect(within(recent).getByRole('button', { name: '😂' })).toBeVisible()
  })

  it('switches categories and says when nothing matches', async () => {
    const { user } = renderApp(CHANNEL_URL, { user: testUser })
    await composer()
    await user.click(screen.getByRole('button', { name: 'Эмодзи' }))
    const picker = await screen.findByRole('dialog', { name: 'Эмодзи' })

    await user.click(await within(picker).findByRole('tab', { name: 'Еда и напитки' }))
    expect(within(picker).getByRole('button', { name: /^🍕/ })).toBeVisible()

    await user.type(within(picker).getByRole('searchbox', { name: 'Поиск эмодзи' }), 'zzzzzz')
    expect(within(picker).getByText('Ничего не нашлось')).toBeVisible()
  })

  it('reacts with any emoji from the message menu', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(CHANNEL_URL, { api })
    await screen.findByText('Как дела?')
    const row = screen.getByText('Как дела?').closest('li') as HTMLElement

    const menu = await openMessageMenu(row)
    await user.click(within(menu).getByRole('menuitem', { name: 'Добавить реакцию' }))
    const picker = await screen.findByRole('dialog', { name: 'Добавить реакцию' })
    expect(within(picker).getByRole('button', { name: 'Отреагировать: 👍' })).toBeVisible()
    await user.type(within(picker).getByRole('searchbox', { name: 'Поиск эмодзи' }), 'пицца')
    await user.click(await within(picker).findByRole('button', { name: /^🍕/ }))

    await waitFor(() => expect(api.reactions.add).toHaveBeenCalledWith('503', '1002', '🍕'))
  })
})
