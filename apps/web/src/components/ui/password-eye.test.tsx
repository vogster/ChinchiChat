import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { UserEvent } from '@testing-library/user-event'

/** Every password field shows what was typed on its eye, and hides it again. */
const checkEyes = async (user: UserEvent, scope: HTMLElement, labels: readonly string[]) => {
  for (const label of labels) {
    const field = within(scope).getByLabelText(label, { exact: true })
    expect(field).toHaveAttribute('type', 'password')
    const eye = field.parentElement?.querySelector('button') as HTMLButtonElement
    expect(eye).toHaveAccessibleName('Показать пароль')
    await user.click(eye)
    expect(field).toHaveAttribute('type', 'text')
    await user.click(
      within(scope).getAllByRole('button', { name: 'Скрыть пароль' })[0] as HTMLElement,
    )
    expect(field).toHaveAttribute('type', 'password')
  }
}

describe('password fields', () => {
  it('have an eye when signing in and registering', async () => {
    const signIn = renderApp('/login', { api: createFakeApi() })
    await screen.findByLabelText('Пароль', { exact: true })
    await checkEyes(signIn.user, document.body, ['Пароль'])
    signIn.unmount()

    const register = renderApp('/register', { api: createFakeApi() })
    await screen.findByLabelText('Пароль', { exact: true })
    await checkEyes(register.user, document.body, ['Пароль'])
  })

  it('have an eye when setting a new password from the email link', async () => {
    const { user } = renderApp('/reset-password#token=a'.padEnd(64, 'a'), {
      api: createFakeApi(),
    })
    await screen.findByLabelText('Новый пароль', { exact: true })
    await checkEyes(user, document.body, ['Новый пароль'])
  })

  it('have an eye when changing the password and turning 2FA on', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp('/settings/account', { api })

    await user.click(await screen.findByRole('button', { name: /^Пароль/ }))
    const settings = await screen.findByRole('dialog', { name: 'Настройки пользователя' })
    await within(settings).findByLabelText('Текущий пароль', { exact: true })
    await checkEyes(user, settings, ['Текущий пароль', 'Новый пароль', 'Повторите новый пароль'])

    await user.click(screen.getByRole('button', { name: /^Двухфакторная аутентификация/ }))
    await user.click(await screen.findByRole('button', { name: 'Включить 2FA' }))
    const mfa = await screen.findByRole('dialog', { name: 'Двухфакторная аутентификация' })
    await checkEyes(user, mfa, ['Пароль'])
  })
})
