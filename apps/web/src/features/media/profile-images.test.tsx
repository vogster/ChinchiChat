import { PROFILE_IMAGE_MAX_BYTES } from '@chinchi/shared'
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testMessage, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const AVATAR = '/api/v1/avatars/100/901.webp'
const ICON = '/api/v1/icons/500/902.webp'
const BANNER = '/api/v1/banners/100/902.webp'

const image = (size = 10, type = 'image/png') =>
  new File([new Uint8Array(size)], 'me.png', { type })

const imgIn = (element: HTMLElement) => element.querySelector('img')

describe('banner in profile settings', () => {
  it('uploads a banner, shows it in the preview and removes it', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp('/settings/profile', { api })
    const file = image()

    await user.upload(await screen.findByLabelText('Загрузить баннер'), file)

    await waitFor(() => expect(api.users.setBanner).toHaveBeenCalledWith(file))
    await waitFor(() =>
      expect(imgIn(screen.getByTestId('profile-banner'))).toHaveAttribute('src', BANNER),
    )

    await user.click(screen.getByRole('button', { name: 'Удалить баннер' }))
    await waitFor(() => expect(api.users.clearBanner).toHaveBeenCalled())
    await waitFor(() => expect(imgIn(screen.getByTestId('profile-banner'))).toBeNull())
  })
})

describe('avatar in profile settings', () => {
  it('uploads a new avatar and shows it right away', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp('/settings/profile', { api })
    const file = image()

    await user.upload(await screen.findByLabelText('Загрузить аватар'), file)

    await waitFor(() => expect(api.users.setAvatar).toHaveBeenCalledWith(file))
    await waitFor(() =>
      expect(imgIn(screen.getByTestId('profile-preview'))).toHaveAttribute('src', AVATAR),
    )
  })

  it('refuses images over the limit without uploading', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp('/settings/profile', { api })

    await user.upload(
      await screen.findByLabelText('Загрузить аватар'),
      image(PROFILE_IMAGE_MAX_BYTES + 1),
    )

    expect(await screen.findByText('Изображение должно быть не больше 8 МБ.')).toBeVisible()
    expect(api.users.setAvatar).not.toHaveBeenCalled()
  })

  it('removes the avatar', async () => {
    const api = createFakeApi({ user: { ...testUser, avatarUrl: AVATAR } })
    const { user } = renderApp('/settings/profile', { api })

    await user.click(await screen.findByRole('button', { name: 'Удалить аватар' }))

    await waitFor(() => expect(api.users.clearAvatar).toHaveBeenCalled())
    // Back to the picture drawn from the user's id.
    await waitFor(() =>
      expect(imgIn(screen.getByTestId('profile-preview'))).toHaveAttribute('data-generated'),
    )
  })

  it('hides uploading when the instance has no file storage', async () => {
    const api = createFakeApi({ user: testUser })
    api.instance.get.mockResolvedValue({
      instance: {
        name: 'Chinchi',
        registrationMode: 'open',
        uploads: null,
        voice: false,
        requireVerifiedEmail: false,
      },
    })
    renderApp('/settings/profile', { api })

    expect(await screen.findByLabelText('Отображаемое имя')).toBeVisible()
    expect(screen.queryByLabelText('Загрузить аватар')).toBeNull()
  })
})

describe('server icon', () => {
  it('uploads an icon from the server overview and shows it in the server list', async () => {
    const api = createFakeApi({ user: testUser })
    // The server reports the icon once it has been uploaded.
    const iconUrl = () => (api.guilds.setIcon.mock.calls.length > 0 ? ICON : null)
    api.guilds.get.mockImplementation(async () => ({ guild: { ...testGuild, iconUrl: iconUrl() } }))
    api.guilds.list.mockImplementation(async () => ({
      guilds: [{ ...testGuild, iconUrl: iconUrl() }],
    }))
    const { user } = renderApp(`/server-settings/${testGuild.id}/overview`, { api })
    const file = image()

    await user.upload(await screen.findByLabelText('Загрузить иконку'), file)

    await waitFor(() => expect(api.guilds.setIcon).toHaveBeenCalledWith(testGuild.id, file))
    await user.click(screen.getByRole('link', { name: 'Закрыть настройки сервера' }))
    const link = await screen.findByRole('link', { name: testGuild.name })
    await waitFor(() => expect(imgIn(link)).toHaveAttribute('src', ICON))
  })
})

describe('avatars in the chat', () => {
  it('shows authors with avatars', async () => {
    const api = createFakeApi({ user: testUser })
    api.messages.list.mockResolvedValue({
      messages: [
        testMessage('1001', {
          author: { id: '200', username: 'bob', displayName: 'Боб', avatarUrl: AVATAR },
        }),
      ],
    })
    renderApp(`/channels/${testGuild.id}/503`, { api })

    const item = (await screen.findByText('Сообщение 1001')).closest('li') as HTMLElement
    expect(imgIn(item)).toHaveAttribute('src', AVATAR)
    expect(within(item).getByText('Боб')).toBeVisible()
  })
})
