import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createFakeApi, testGuild, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const GENERAL_URL = `/channels/${testGuild.id}/503`
const NOW = new Date('2026-10-15T12:00:00.000Z')

const panel = () => screen.findByRole('region', { name: 'Текущий пользователь' })
const members = () => screen.findByRole('complementary', { name: /Участники/ })

afterEach(() => {
  vi.useRealTimers()
})

describe('custom status', () => {
  it('is set from the user panel for an hour and shown there', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(GENERAL_URL, { api })

    await user.click(within(await panel()).getByRole('button', { name: 'Изменить статус' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Задать свой статус' }))
    const dialog = await screen.findByRole('dialog', { name: 'Свой статус' })
    await user.type(within(dialog).getByLabelText('Эмодзи', { exact: true }), '🍜')
    await user.type(within(dialog).getByLabelText('Статус', { exact: true }), 'Обедаю')
    await user.selectOptions(within(dialog).getByLabelText('Убрать через'), '1 час')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    await waitFor(() =>
      expect(api.users.setCustomStatus).toHaveBeenCalledWith({
        text: 'Обедаю',
        emoji: '🍜',
        expiresAt: '2026-10-15T13:00:00.000Z',
      }),
    )
    expect(await within(await panel()).findByText('🍜 Обедаю')).toBeVisible()
  })

  it('can be cleared', async () => {
    const api = createFakeApi({ user: testUser })
    const { user, gateway } = renderApp(GENERAL_URL, { api })
    await panel()
    act(() =>
      gateway.emit('PRESENCE_UPDATE', {
        userId: testUser.id,
        status: 'online',
        customStatus: { text: 'Обедаю', emoji: null, expiresAt: null },
      }),
    )
    expect(await within(await panel()).findByText('Обедаю')).toBeVisible()

    await user.click(within(await panel()).getByRole('button', { name: 'Изменить статус' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Задать свой статус' }))
    const dialog = await screen.findByRole('dialog', { name: 'Свой статус' })
    expect(within(dialog).getByLabelText('Статус', { exact: true })).toHaveValue('Обедаю')
    await user.click(within(dialog).getByRole('button', { name: 'Убрать статус' }))

    await waitFor(() => expect(api.users.clearCustomStatus).toHaveBeenCalled())
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Текущий пользователь' })).queryByText('Обедаю'),
      ).toBeNull(),
    )
  })

  it('shows other people’s status in the member list and on their card', async () => {
    const { user, gateway } = renderApp(GENERAL_URL, { user: testUser })
    const list = await members()
    act(() =>
      gateway.emit('PRESENCE_UPDATE', {
        userId: '200',
        status: 'online',
        customStatus: { text: 'Строю плотину', emoji: '🦫', expiresAt: null },
      }),
    )

    expect(await within(list).findByText('🦫 Строю плотину')).toBeVisible()
    await user.click(within(list).getByRole('button', { name: /^Боб,/ }))
    const card = await screen.findByRole('dialog', { name: 'Профиль: Боб' })
    expect(within(card).getByText('🦫 Строю плотину')).toBeVisible()
  })

  it('hides a status that has ended or whose owner went offline', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    const { gateway } = renderApp(GENERAL_URL, { user: testUser })
    const list = await members()
    act(() =>
      gateway.emit('PRESENCE_UPDATE', {
        userId: '200',
        status: 'online',
        customStatus: { text: 'Было', emoji: null, expiresAt: '2026-10-15T11:00:00.000Z' },
      }),
    )
    await within(list).findByRole('button', { name: /^Боб, В сети/ })
    expect(within(list).queryByText('Было')).toBeNull()

    act(() =>
      gateway.emit('PRESENCE_UPDATE', {
        userId: '200',
        status: 'online',
        customStatus: { text: 'Есть', emoji: null, expiresAt: null },
      }),
    )
    expect(await within(list).findByText('Есть')).toBeVisible()
    act(() => gateway.emit('PRESENCE_UPDATE', { userId: '200', status: 'offline' }))
    await waitFor(() => expect(within(list).queryByText('Есть')).toBeNull())
  })
})
