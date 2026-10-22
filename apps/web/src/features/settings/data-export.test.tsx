import { ApiError } from '@chinchi/sdk'
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createFakeApi, testUser } from '../../test/fake-api'
import { createFakeShell } from '../../test/fake-shell'
import { renderApp } from '../../test/render-app'

const openExport = async (user: ReturnType<typeof renderApp>['user']) => {
  await user.click(await screen.findByRole('button', { name: 'Скачать мои данные' }))
  return screen.findByRole('dialog', { name: 'Скачать мои данные' })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('data export', () => {
  it('asks for the password, then downloads the archive by a one-time ticket', async () => {
    const api = createFakeApi({ user: testUser })
    api.users.exportTicket
      .mockRejectedValueOnce(
        new ApiError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect'),
      )
      .mockResolvedValueOnce({ ticket: 'T1cket' })
    const opened: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      opened.push(this.getAttribute('href') ?? '')
    })
    const { user } = renderApp('/settings/account', { api })

    const dialog = await openExport(user)
    const download = within(dialog).getByRole('button', { name: 'Скачать' })
    expect(download).toBeDisabled()
    await user.type(within(dialog).getByLabelText('Пароль', { exact: true }), 'wrong')
    await user.click(download)
    expect(await within(dialog).findByText('Текущий пароль указан неверно.')).toBeVisible()

    await user.clear(within(dialog).getByLabelText('Пароль', { exact: true }))
    await user.type(within(dialog).getByLabelText('Пароль', { exact: true }), 'password123')
    await user.click(download)

    await waitFor(() => expect(opened).toEqual(['/api/v1/users/@me/export/T1cket']))
    expect(api.users.exportTicket).toHaveBeenLastCalledWith('password123', undefined)
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Скачать мои данные' })).not.toBeInTheDocument(),
    )
  })

  it('asks for a code too when two-factor sign-in is on', async () => {
    const api = createFakeApi({ user: { ...testUser, mfaEnabled: true } })
    api.users.exportTicket.mockResolvedValueOnce({ ticket: 'T1cket' })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const { user } = renderApp('/settings/account', { api })

    const dialog = await openExport(user)
    await user.type(within(dialog).getByLabelText('Пароль', { exact: true }), 'password123')
    expect(within(dialog).getByRole('button', { name: 'Скачать' })).toBeDisabled()
    await user.type(within(dialog).getByLabelText(/Код из приложения/), '123 456')
    await user.click(within(dialog).getByRole('button', { name: 'Скачать' }))

    await waitFor(() =>
      expect(api.users.exportTicket).toHaveBeenCalledWith('password123', '123 456'),
    )
  })

  it('in the desktop app, fetches the archive with the session and saves it', async () => {
    const api = createFakeApi({ user: testUser })
    api.users.exportTicket.mockResolvedValueOnce({ ticket: 'T1cket' })
    api.media.download.mockResolvedValueOnce(new Blob(['zip']))
    const desktop = createFakeShell()
    const { user } = renderApp('/settings/account', { api, shell: desktop.shell })

    const dialog = await openExport(user)
    await user.type(within(dialog).getByLabelText('Пароль', { exact: true }), 'password123')
    await user.click(within(dialog).getByRole('button', { name: 'Скачать' }))

    await waitFor(() =>
      expect(desktop.saved().map((file) => file.name)).toEqual([
        expect.stringMatching(/^chinchi-alice-\d{4}-\d{2}-\d{2}\.zip$/),
      ]),
    )
    expect(api.media.download).toHaveBeenCalledWith('/api/v1/users/@me/export/T1cket')
  })
})
