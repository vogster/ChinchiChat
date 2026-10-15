import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { apiError, createFakeApi, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const TOKEN = 'B'.repeat(43)

describe('verify email page', () => {
  it('verifies the address once and offers to continue', async () => {
    const api = createFakeApi()
    renderApp(`/verify-email?token=${TOKEN}`, { api })

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
  const unverified = { ...testUser, emailVerified: false }

  it('asks unverified users to confirm and can resend the email', async () => {
    const api = createFakeApi({ user: unverified })
    const { user } = renderApp('/', { api })

    expect(
      await screen.findByText(/Подтвердите email — мы отправили письмо на alice@example.com/),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Отправить ещё раз' }))

    expect(await screen.findByText('Письмо отправлено')).toBeVisible()
    expect(api.auth.resendVerification).toHaveBeenCalledTimes(1)
  })

  it('is hidden for verified users', async () => {
    renderApp('/', { user: testUser })

    await screen.findByRole('heading', { name: 'Друзья', level: 1 })
    expect(screen.queryByText(/Подтвердите email/)).not.toBeInTheDocument()
  })
})
