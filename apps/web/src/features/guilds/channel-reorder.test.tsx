import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { apiError, createFakeApi, testGuild, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const GENERAL_URL = `/channels/${testGuild.id}/503`
const member = { ...testUser, id: '999', username: 'carol' }

const sidebar = () => screen.findByRole('navigation', { name: 'Каналы' })
const rowOf = async (name: string) =>
  (await within(await sidebar()).findByRole('link', { name })).closest('li') as HTMLElement
const names = async () =>
  within(await sidebar())
    .getAllByRole('link')
    .map((link) => link.textContent)

const drag = (from: HTMLElement, to: HTMLElement) => {
  fireEvent.dragStart(from)
  fireEvent.dragEnter(to)
  fireEvent.dragOver(to)
  fireEvent.drop(to)
  fireEvent.dragEnd(from)
}

describe('reordering channels', () => {
  it('drags a channel above another, showing the new order at once', async () => {
    const api = createFakeApi({ user: testUser })
    renderApp(GENERAL_URL, { api })

    drag(await rowOf('мемы'), await rowOf('общий'))

    expect(await names()).toEqual(['мемы', 'общий'])
    await waitFor(() =>
      expect(api.channels.reorder).toHaveBeenCalledWith(testGuild.id, [
        { id: '504', position: 0 },
        { id: '503', position: 1 },
      ]),
    )
  })

  it('moves a channel with Alt and the arrow keys', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(GENERAL_URL, { api })

    within(await sidebar())
      .getByRole('link', { name: 'общий' })
      .focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')

    await waitFor(() =>
      expect(api.channels.reorder).toHaveBeenCalledWith(testGuild.id, [
        { id: '504', position: 0 },
        { id: '503', position: 1 },
      ]),
    )
  })

  it('puts the order back when the server refuses', async () => {
    const api = createFakeApi({ user: testUser })
    api.channels.reorder.mockRejectedValueOnce(apiError(403, 'MISSING_PERMISSIONS'))
    renderApp(GENERAL_URL, { api })

    drag(await rowOf('мемы'), await rowOf('общий'))

    await waitFor(() => expect(api.channels.reorder).toHaveBeenCalled())
    await waitFor(async () => expect(await names()).toEqual(['общий', 'мемы']))
  })

  it('does not offer dragging without the right to manage channels', async () => {
    const api = createFakeApi({ user: member })
    api.guilds.get.mockResolvedValue({ guild: { ...testGuild, ownerId: testUser.id } })
    renderApp(GENERAL_URL, { api })

    expect(await rowOf('общий')).not.toHaveAttribute('draggable')
  })
})
