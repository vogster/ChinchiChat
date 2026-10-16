import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { apiError, createFakeApi } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const TOKEN = 'A'.repeat(43)

describe('forgot password page', () => {
  it('confirms the request without revealing whether the account exists', async () => {
    const api = createFakeApi()
    const { user } = renderApp('/forgot-password', { api })

    await user.type(await screen.findByLabelText('Email'), 'alice@example.com')
    await user.click(screen.getByRole('button', { name: 'Отправить ссылку' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Если такой email зарегистрирован')
    expect(api.auth.forgotPassword).toHaveBeenCalledWith('alice@example.com')
  })

  it('validates the email', async () => {
    const api = createFakeApi()
    const { user } = renderApp('/forgot-password', { api })

    await user.type(await screen.findByLabelText('Email'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Отправить ссылку' }))

    expect(await screen.findByText('Введите корректный email')).toBeVisible()
    expect(api.auth.forgotPassword).not.toHaveBeenCalled()
  })
})

describe('reset password page', () => {
  it('sets a new password from the emailed link (token in the fragment)', async () => {
    const api = createFakeApi()
    const { user } = renderApp(`/reset-password#token=${TOKEN}`, { api })

    await user.type(await screen.findByLabelText('Новый пароль'), 'brand-new-pass')
    await user.click(screen.getByRole('button', { name: 'Сохранить пароль' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Пароль изменён')
    expect(api.auth.resetPassword).toHaveBeenCalledWith(TOKEN, 'brand-new-pass')
  })

  it('still takes the token from the query string of older emails', async () => {
    const api = createFakeApi()
    const { user } = renderApp(`/reset-password?token=${TOKEN}`, { api })

    await user.type(await screen.findByLabelText('Новый пароль'), 'brand-new-pass')
    await user.click(screen.getByRole('button', { name: 'Сохранить пароль' }))

    expect(api.auth.resetPassword).toHaveBeenCalledWith(TOKEN, 'brand-new-pass')
  })

  it('reports an expired link', async () => {
    const api = createFakeApi()
    api.auth.resetPassword.mockRejectedValueOnce(apiError(400, 'INVALID_TOKEN'))
    const { user } = renderApp(`/reset-password?token=${TOKEN}`, { api })

    await user.type(await screen.findByLabelText('Новый пароль'), 'brand-new-pass')
    await user.click(screen.getByRole('button', { name: 'Сохранить пароль' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ссылка недействительна')
  })

  it('handles a link without a token', async () => {
    renderApp('/reset-password')

    expect(await screen.findByRole('alert')).toHaveTextContent('Ссылка неполная')
  })
})
