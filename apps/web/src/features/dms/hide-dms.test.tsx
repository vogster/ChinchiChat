import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testDm, testGroupDm, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const DM_URL = `/channels/@me/${testDm.id}`

const sidebar = () => screen.findByRole('complementary', { name: 'Личные сообщения' })
const actions = async (name: string) =>
  within(await sidebar()).findByRole('button', { name: `Действия: ${name}` })

describe('hiding DMs', () => {
  it('takes a DM off the list from its menu and leaves it if it was open', async () => {
    const api = createFakeApi({ user: testUser })
    // Like the server: a hidden DM is no longer listed.
    api.dms.hide.mockImplementation(async () => {
      api.dms.list.mockResolvedValue({ channels: [testGroupDm] })
    })
    const { user, router } = renderApp(DM_URL, { api })

    await user.click(await actions('Боб'))
    await user.click(await screen.findByRole('menuitem', { name: 'Скрыть' }))

    await waitFor(() => expect(api.dms.hide).toHaveBeenCalledWith(testDm.id))
    await waitFor(() =>
      expect(
        within(screen.getByRole('navigation', { name: 'Личные сообщения' })).queryByRole('link', {
          name: 'Боб',
        }),
      ).toBeNull(),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('shows it again when the server says so (a new message, another tab)', async () => {
    const api = createFakeApi({ user: testUser })
    const { user, gateway } = renderApp('/', { api })
    await user.click(await actions('Боб'))
    await user.click(await screen.findByRole('menuitem', { name: 'Скрыть' }))
    const nav = screen.getByRole('navigation', { name: 'Личные сообщения' })
    await waitFor(() => expect(within(nav).queryByRole('link', { name: /^Боб$/ })).toBeNull())

    act(() => gateway.emit('PRIVATE_CHANNEL_CREATE', testDm))

    expect(await within(nav).findByRole('link', { name: /^Боб/ })).toBeVisible()
  })

  it('offers to leave a group from the same menu', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp('/', { api })

    await user.click(await actions('Боб, carol'))
    expect(await screen.findByRole('menuitem', { name: 'Скрыть' })).toBeVisible()
    await user.click(screen.getByRole('menuitem', { name: 'Покинуть группу' }))
    const dialog = await screen.findByRole('dialog', { name: 'Покинуть группу' })
    await user.click(within(dialog).getByRole('button', { name: 'Покинуть группу' }))

    await waitFor(() =>
      expect(api.dms.removeRecipient).toHaveBeenCalledWith(testGroupDm.id, testUser.id),
    )
  })
})
