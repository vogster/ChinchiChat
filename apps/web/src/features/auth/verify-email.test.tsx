import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiError, createFakeApi, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const TOKEN = 'B'.repeat(43)

describe('verify email page', () => {
  it('verifies the address once and offers to continue', async () => {
    const api = createFakeApi()
    renderApp(`/verify-email#token=${TOKEN}`, { api })

    expect(await screen.findByRole('status')).toHaveTextContent('Email подтверждён')
    expect(screen.getByRole('link', { name: 'Перейти в Chinchi' })).toHaveAttribute('href', '/')
    expect(api.auth.verifyEmail).toHaveBeenCalledTimes(1)
    expect(api.auth.verifyEmail).toHaveBeenCalledWith(TOKEN)
  })

  it('reports an invalid link', async () => {
    const api = createFakeApi()
    api.auth.verifyEmail.mockRejectedValueOnce(apiError(400, 'INVALID_TOKEN'))
    renderApp(`/verify-email?token=${TOKEN}`, { api })

    expect(await screen.findByRole('alert')).toHaveTextContent('Ссылка недействительна')
  })

  it('handles a link without a token', async () => {
    renderApp('/verify-email')

    expect(await screen.findByRole('alert')).toHaveTextContent('Ссылка недействительна')
  })
})

describe('verify email banner', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const unverified = { ...testUser, emailVerified: false }

  it('asks unverified users to confirm and can resend the email', async () => {
    const api = createFakeApi({ user: unverified })
    const { user } = renderApp('/', { api })

    expect(
      await screen.findByText((_, element) =>
        element?.getAttribute('role') === 'status'
          ? element.textContent ===
            'Подтвердите email — мы отправили письмо на alice@example.com.Изменить emailОтправить ещё раз'
          : false,
      ),
    ).toBeVisible()
    expect(screen.getByText('alice@example.com')).toHaveClass('font-semibold')
    await user.click(screen.getByRole('button', { name: 'Отправить ещё раз' }))

    expect(await screen.findByRole('button', { name: 'Отправили · 30 с' })).toBeDisabled()
    expect(api.auth.resendVerification).toHaveBeenCalledTimes(1)
  })

  it('lets the email be sent again once the cooldown is over', async () => {
    const start = new Date('2026-10-18T12:00:00Z')
    vi.useFakeTimers({ now: start, toFake: ['Date'] })
    const api = createFakeApi({ user: unverified })
    const { user } = renderApp('/', { api })

    await user.click(await screen.findByRole('button', { name: 'Отправить ещё раз' }))
    await screen.findByRole('button', { name: 'Отправили · 30 с' })

    vi.setSystemTime(start.getTime() + 30_000)
    const again = await screen.findByRole(
      'button',
      { name: 'Отправить ещё раз' },
      { timeout: 2_000 },
    )
    await user.click(again)
    await waitFor(() => expect(api.auth.resendVerification).toHaveBeenCalledTimes(2))
  })

  it('shows why the email could not be sent', async () => {
    const api = createFakeApi({ user: unverified })
    api.auth.resendVerification.mockRejectedValueOnce(apiError(429, 'RATE_LIMITED'))
    const { user } = renderApp('/', { api })

    await user.click(await screen.findByRole('button', { name: 'Отправить ещё раз' }))

    expect(await screen.findByText(/Слишком много/)).toBeVisible()
  })

  it('is hidden for verified users', async () => {
    renderApp('/', { user: testUser })

    await screen.findByRole('heading', { name: 'Друзья', level: 1 })
    expect(screen.queryByText(/Подтвердите email/)).not.toBeInTheDocument()
  })
})
