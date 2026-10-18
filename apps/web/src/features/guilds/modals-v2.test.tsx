import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testDm, testGuild, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const GENERAL_URL = `/channels/${testGuild.id}/503`

describe('adding a server', () => {
  it('previews the server icon from its name', async () => {
    const { user } = renderApp('/', { user: testUser })
    await user.click(await screen.findByRole('button', { name: 'Добавить сервер' }))
    const dialog = await screen.findByRole('dialog', { name: 'Создайте свой сервер' })

    const name = within(dialog).getByLabelText('Название сервера')
    await user.clear(name)
    await user.type(name, 'Книжный клуб')

    expect(within(dialog).getByTestId('guild-icon-preview')).toHaveTextContent('КК')
  })

  it('shows the server an invite leads to before joining', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp('/', { api })
    await user.click(await screen.findByRole('button', { name: 'Добавить сервер' }))
    const dialog = await screen.findByRole('dialog', { name: 'Создайте свой сервер' })

    await user.click(within(dialog).getByRole('tab', { name: 'По приглашению' }))
    await user.type(within(dialog).getByLabelText('Ссылка-приглашение'), 'AbCd1234')

    const found = await within(dialog).findByRole('group', { name: 'Котики' })
    expect(found).toHaveTextContent('2 участника')
    expect(api.invites.get).toHaveBeenCalledWith('AbCd1234')
  })
})

describe('settings window', () => {
  it('groups the sections and shows who is signed in', async () => {
    renderApp('/?settings=account', { user: testUser })
    const nav = await screen.findByRole('navigation', { name: 'Настройки пользователя' })

    expect(within(nav).getByRole('group', { name: 'Аккаунт' })).toBeVisible()
    expect(within(nav).getByRole('group', { name: 'Приложение' })).toBeVisible()
    expect(within(nav).getByRole('group', { name: 'Для разработчиков' })).toBeVisible()
    expect(within(nav).getByText('@alice')).toBeVisible()
  })
})

describe('profile card', () => {
  it('calls someone from their card', async () => {
    const api = createFakeApi({ user: testUser })
    api.instance.get.mockResolvedValue({
      instance: {
        name: 'Chinchi',
        registrationMode: 'open',
        uploads: null,
        voice: true,
        requireVerifiedEmail: false,
      },
    })
    const { user } = renderApp(GENERAL_URL, { api })

    const members = await screen.findByRole('complementary', { name: /Участники/ })
    await user.click(await within(members).findByRole('button', { name: /^Боб,/ }))
    const card = await screen.findByRole('dialog', { name: 'Профиль: Боб' })
    await user.click(await within(card).findByRole('button', { name: 'Позвонить' }))

    expect(api.dms.open).toHaveBeenCalledWith(['200'])
    await waitFor(() =>
      expect(api.voice.join).toHaveBeenCalledWith(testDm.id, { selfMute: false, selfDeaf: false }),
    )
  })
})
