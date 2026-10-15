import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { initI18n } from '../../lib/i18n'
import { getVoicePreferences, resetVoicePreferences } from '../voice/voice-preferences'
import { apiError, createFakeApi, testSessions, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

afterEach(() => {
  initI18n('ru')
})

describe('settings', () => {
  it('requires a signed-in user', async () => {
    const { router } = renderApp('/settings/account')

    expect(await screen.findByRole('heading', { name: 'С возвращением!' })).toBeVisible()
    expect(router.state.location.search).toEqual({ redirect: '/settings/account' })
  })

  it('opens from the user panel and closes back to the app', async () => {
    const { user, router } = renderApp('/', { user: testUser })

    await user.click(await screen.findByRole('link', { name: 'Настройки пользователя' }))
    expect(await screen.findByRole('heading', { name: 'Моя учётная запись' })).toBeVisible()

    await user.click(screen.getByRole('link', { name: 'Закрыть настройки' }))
    expect(await screen.findByRole('heading', { name: 'Друзья', level: 1 })).toBeVisible()
    expect(router.state.location.pathname).toBe('/')
  })

  it('closes with Escape', async () => {
    const { user, router } = renderApp('/settings/profile', { user: testUser })

    await screen.findByRole('heading', { name: 'Профиль' })
    await user.keyboard('{Escape}')

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('redirects /settings to the account section', async () => {
    const { router } = renderApp('/settings', { user: testUser })

    expect(await screen.findByRole('heading', { name: 'Моя учётная запись' })).toBeVisible()
    expect(router.state.location.pathname).toBe('/settings/account')
  })
})

describe('account section', () => {
  it('shows the username, email and verification status', async () => {
    renderApp('/settings/account', { user: { ...testUser, emailVerified: false } })

    expect(await screen.findByText('alice@example.com')).toBeVisible()
    expect(screen.getByText('Не подтверждён')).toBeVisible()
  })

  it('changes the password', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp('/settings/account', { api })

    await user.type(await screen.findByLabelText('Текущий пароль'), 'old-password')
    await user.type(screen.getByLabelText('Новый пароль'), 'new-password')
    await user.type(screen.getByLabelText('Повторите новый пароль'), 'new-password')
    await user.click(screen.getByRole('button', { name: 'Сменить пароль' }))

    expect(await screen.findByText(/Пароль изменён/)).toBeVisible()
    expect(api.auth.changePassword).toHaveBeenCalledWith({
      currentPassword: 'old-password',
      newPassword: 'new-password',
    })
    expect(screen.getByLabelText('Текущий пароль')).toHaveValue('')
  })

  it('checks that the new passwords match', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp('/settings/account', { api })

    await user.type(await screen.findByLabelText('Текущий пароль'), 'old-password')
    await user.type(screen.getByLabelText('Новый пароль'), 'new-password')
    await user.type(screen.getByLabelText('Повторите новый пароль'), 'other-password')
    await user.click(screen.getByRole('button', { name: 'Сменить пароль' }))

    expect(await screen.findByText('Пароли не совпадают')).toBeVisible()
    expect(api.auth.changePassword).not.toHaveBeenCalled()
  })

  it('shows a wrong current password on its field', async () => {
    const api = createFakeApi({ user: testUser })
    api.auth.changePassword.mockRejectedValueOnce(apiError(400, 'INVALID_CURRENT_PASSWORD'))
    const { user } = renderApp('/settings/account', { api })

    await user.type(await screen.findByLabelText('Текущий пароль'), 'nope')
    await user.type(screen.getByLabelText('Новый пароль'), 'new-password')
    await user.type(screen.getByLabelText('Повторите новый пароль'), 'new-password')
    await user.click(screen.getByRole('button', { name: 'Сменить пароль' }))

    expect(await screen.findByText('Текущий пароль указан неверно.')).toBeVisible()
    expect(screen.getByLabelText('Текущий пароль')).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('profile section', () => {
  it('updates the display name and the user panel', async () => {
    const api = createFakeApi({ user: testUser })
    api.users.updateMe.mockResolvedValueOnce({ user: { ...testUser, displayName: 'Алиса' } })
    const { user } = renderApp('/settings/profile', { api })

    const field = await screen.findByLabelText('Отображаемое имя')
    await user.type(field, '  Алиса ')
    expect(within(screen.getByTestId('profile-preview')).getByText('Алиса')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByText('Сохранено')).toBeVisible()
    expect(api.users.updateMe).toHaveBeenCalledWith({ displayName: 'Алиса' })
  })

  it('clears the display name when the field is emptied', async () => {
    const api = createFakeApi({ user: { ...testUser, displayName: 'Old' } })
    const { user } = renderApp('/settings/profile', { api })

    await user.clear(await screen.findByLabelText('Отображаемое имя'))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(api.users.updateMe).toHaveBeenCalledWith({ displayName: null }))
  })

  it('sets "about me", sending only what changed', async () => {
    const api = createFakeApi({ user: testUser })
    api.users.updateMe.mockResolvedValueOnce({ user: { ...testUser, bio: 'Рисую котиков' } })
    const { user } = renderApp('/settings/profile', { api })

    const bio = await screen.findByLabelText('Обо мне')
    await user.type(bio, 'Рисую котиков')
    expect(screen.getByText('177')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(api.users.updateMe).toHaveBeenCalledWith({ bio: 'Рисую котиков' }))
  })

  it('picks a profile colour and resets it', async () => {
    const api = createFakeApi({ user: testUser })
    api.users.updateMe.mockResolvedValueOnce({ user: { ...testUser, accentColor: 0xff8800 } })
    const { user } = renderApp('/settings/profile', { api })

    fireEvent.input(await screen.findByLabelText('Цвет профиля'), {
      target: { value: '#ff8800' },
    })
    expect(screen.getByTestId('profile-banner')).toHaveStyle({ backgroundColor: '#ff8800' })
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(api.users.updateMe).toHaveBeenCalledWith({ accentColor: 0xff8800 }))

    api.users.updateMe.mockResolvedValueOnce({ user: testUser })
    await user.click(await screen.findByRole('button', { name: 'Сбросить цвет' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(api.users.updateMe).toHaveBeenLastCalledWith({ accentColor: null }))
  })

  it('disables saving until something changes', async () => {
    renderApp('/settings/profile', { user: testUser })

    expect(await screen.findByRole('button', { name: 'Сохранить' })).toBeDisabled()
  })
})

describe('sessions section', () => {
  it('lists devices and marks the current one', async () => {
    renderApp('/settings/sessions', { user: testUser })

    const list = await screen.findByRole('list', { name: 'Устройства' })
    expect(within(list).getByText('Chrome · macOS')).toBeVisible()
    expect(within(list).getByText('Это устройство')).toBeVisible()
    expect(within(list).getByText('Firefox · Linux')).toBeVisible()
  })

  it('signs out a single other device', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp('/settings/sessions', { api })

    await user.click(
      await screen.findByRole('button', { name: 'Выйти на устройстве Firefox · Linux' }),
    )

    await waitFor(() => expect(api.sessions.revoke).toHaveBeenCalledWith('2'))
    expect(api.sessions.list).toHaveBeenCalledTimes(2)
  })

  it('signs out all other devices', async () => {
    const api = createFakeApi({ user: testUser })
    api.sessions.list
      .mockResolvedValueOnce({ sessions: [...testSessions] })
      .mockResolvedValue({ sessions: testSessions.filter((s) => s.current) })
    const { user } = renderApp('/settings/sessions', { api })

    await user.click(
      await screen.findByRole('button', { name: 'Выйти на всех остальных устройствах' }),
    )

    expect(await screen.findByText('Выход на остальных устройствах выполнен')).toBeVisible()
    expect(api.sessions.revokeOthers).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Firefox · Linux')).not.toBeInTheDocument()
  })
})

describe('language section', () => {
  it('switches the interface language', async () => {
    const { user } = renderApp('/settings/language', { user: testUser })

    await user.click(await screen.findByRole('radio', { name: 'English' }))

    expect(await screen.findByRole('heading', { name: 'Language' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'My account' })).toBeVisible()
    expect(document.documentElement.lang).toBe('en')
  })
})

describe('privacy section', () => {
  it('chooses who may send DMs', async () => {
    const api = createFakeApi({ user: testUser })
    api.users.updateMe.mockResolvedValue({ user: { ...testUser, dmPolicy: 'friends' } })
    const { user } = renderApp('/settings/privacy', { api })

    const servers = await screen.findByRole('radio', { name: 'Друзья и участники общих серверов' })
    expect(servers).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Только друзья' }))

    expect(api.users.updateMe).toHaveBeenCalledWith({ dmPolicy: 'friends' })
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Только друзья' })).toBeChecked())
    expect(screen.getByRole('link', { name: 'Конфиденциальность' })).toBeVisible()
  })
})

describe('voice and video section', () => {
  const devices = [
    { kind: 'audioinput', deviceId: 'default', label: 'Встроенный микрофон' },
    { kind: 'audioinput', deviceId: 'mic-2', label: 'USB Mic' },
    { kind: 'audiooutput', deviceId: 'spk-1', label: 'Колонки' },
    { kind: 'videoinput', deviceId: 'cam-1', label: '' },
  ]

  beforeEach(() => {
    window.localStorage.removeItem('chinchi:voice-preferences')
    resetVoicePreferences()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: vi.fn(async () => devices),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
  })

  it('picks devices and noise suppression, remembered in this browser', async () => {
    const { user } = renderApp('/settings/voice', { user: testUser })

    const microphone = await screen.findByRole('combobox', { name: 'Микрофон' })
    await within(microphone).findByRole('option', { name: 'USB Mic' })
    await user.selectOptions(microphone, 'mic-2')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Динамики' }), 'spk-1')
    expect(screen.getByRole('option', { name: 'Камера 1' })).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Шумоподавление' }))

    expect(getVoicePreferences()).toEqual({
      audioInput: 'mic-2',
      audioOutput: 'spk-1',
      videoInput: null,
      noiseSuppression: false,
    })
    expect(
      JSON.parse(window.localStorage.getItem('chinchi:voice-preferences') ?? '{}'),
    ).toMatchObject({ audioInput: 'mic-2' })
    expect(screen.getByRole('link', { name: 'Голос и видео' })).toBeVisible()
  })

  it('explains when the browser does not list devices', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    renderApp('/settings/voice', { user: testUser })

    expect(await screen.findByText(/Браузер не даёт выбрать устройства/)).toBeVisible()
    expect(screen.getByRole('switch', { name: 'Шумоподавление' })).toBeVisible()
  })
})
