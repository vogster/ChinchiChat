import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testUser } from '../../test/fake-api'
import { openMessageMenu } from '../../test/message-menu'
import { renderApp } from '../../test/render-app'

const GENERAL_URL = `/channels/${testGuild.id}/503`
const row = (text: string) => screen.getByText(text).closest('li') as HTMLElement

describe('message actions', () => {
  it('open with a right click, not on hover', async () => {
    const { user } = renderApp(GENERAL_URL, { user: testUser })
    await screen.findByText('Как дела?')

    await user.hover(row('Как дела?'))
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()

    const menu = await openMessageMenu(row('Как дела?'))
    for (const name of ['Ответить', 'Переслать', 'Пожаловаться', 'Копировать текст']) {
      expect(within(menu).getByRole('menuitem', { name })).toBeVisible()
    }
  })

  it('react from the quick row at the top', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(GENERAL_URL, { api })
    await screen.findByText('Как дела?')

    const menu = await openMessageMenu(row('Как дела?'))
    await user.click(within(menu).getByRole('menuitem', { name: 'Отреагировать: 👍' }))

    await waitFor(() => expect(api.reactions.add).toHaveBeenCalledWith('503', '1002', '👍'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('copy the text of a message', async () => {
    // user-event puts a clipboard of its own in place, which can be read back.
    const { user } = renderApp(GENERAL_URL, { user: testUser })
    await screen.findByText('Как дела?')

    const menu = await openMessageMenu(row('Как дела?'))
    await user.click(within(menu).getByRole('menuitem', { name: 'Копировать текст' }))

    await waitFor(async () => expect(await navigator.clipboard.readText()).toBe('Как дела?'))
  })

  it('delete own messages, at once with Shift held', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(GENERAL_URL, { api })
    await screen.findByText('Отлично!')

    const menu = await openMessageMenu(row('Отлично!'))
    await user.keyboard('{Shift>}')
    await user.click(within(menu).getByRole('menuitem', { name: 'Удалить' }))
    await user.keyboard('{/Shift}')

    await waitFor(() => expect(api.messages.delete).toHaveBeenCalledWith('503', '1003'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
