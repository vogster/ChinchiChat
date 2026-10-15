import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { apiError, createFakeApi, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

describe('deleting your account', () => {
  it('takes the password, then signs you out for good', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp('/settings/account', { api })

    const section = await screen.findByRole('region', { name: 'Удаление учётной записи' })
    const confirm = within(section).getByRole('button', { name: 'Удалить учётную запись' })
    expect(confirm).toBeDisabled()
    await user.type(within(section).getByLabelText('Пароль', { exact: true }), 'password123')
    await user.click(confirm)

    await waitFor(() => expect(api.users.deleteMe).toHaveBeenCalledWith('password123', undefined))
    expect(await screen.findByRole('heading', { name: 'С возвращением!' })).toBeVisible()
  })

  it('says why it can not go yet', async () => {
    const api = createFakeApi({ user: testUser })
    api.users.deleteMe.mockRejectedValueOnce(apiError(400, 'OWNS_GUILDS'))
    const { user } = renderApp('/settings/account', { api })

    const section = await screen.findByRole('region', { name: 'Удаление учётной записи' })
    await user.type(within(section).getByLabelText('Пароль', { exact: true }), 'password123')
    await user.click(within(section).getByRole('button', { name: 'Удалить учётную запись' }))

    expect(await within(section).findByText(/передайте свои серверы/i)).toBeVisible()
  })
})

describe('deleting an account with 2FA', () => {
  it('asks for a code too', async () => {
    const api = createFakeApi({ user: { ...testUser, mfaEnabled: true } })
    const { user } = renderApp('/settings/account', { api })

    const section = await screen.findByRole('region', { name: 'Удаление учётной записи' })
    await user.type(within(section).getByLabelText('Пароль', { exact: true }), 'password123')
    const confirm = within(section).getByRole('button', { name: 'Удалить учётную запись' })
    expect(confirm).toBeDisabled()
    await user.type(
      within(section).getByLabelText('Код из приложения или код восстановления', { exact: true }),
      '123456',
    )
    await user.click(confirm)

    await waitFor(() => expect(api.users.deleteMe).toHaveBeenCalledWith('password123', '123456'))
  })
})

describe('admins deleting accounts', () => {
  it('confirm first, then remove the user from the list', async () => {
    const api = createFakeApi({ user: { ...testUser, isAdmin: true } })
    const { user } = renderApp('/admin/users', { api })

    const list = await screen.findByRole('list', { name: 'Пользователи' })
    await user.click(await within(list).findByRole('button', { name: 'Удалить — bob' }))
    expect(api.admin.deleteUser).not.toHaveBeenCalled()
    await user.click(within(list).getByRole('button', { name: 'Удалить навсегда — bob' }))

    await waitFor(() => expect(api.admin.deleteUser).toHaveBeenCalledWith('200'))
    await waitFor(() => expect(within(list).queryByText('bob@example.com')).toBeNull())
  })
})
