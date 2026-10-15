import { expect, test } from '@playwright/test'

import { tokenFromEmail } from '../support/mailpit'
import { newUser } from '../support/users'

import type { Page } from '@playwright/test'

const register = async (page: Page, user: ReturnType<typeof newUser>) => {
  await page.goto('/register')
  await page.getByLabel('Email', { exact: true }).fill(user.email)
  await page.getByLabel('Имя пользователя').fill(user.username)
  await page.getByLabel('Пароль', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page.getByRole('heading', { name: 'Друзья', level: 1 })).toBeVisible()
}

const logout = async (page: Page) => {
  await page
    .getByRole('region', { name: 'Текущий пользователь' })
    .getByRole('button', { name: 'Выйти' })
    .click()
  await expect(page).toHaveURL(/\/login$/)
}

const login = async (page: Page, identifier: string, password: string) => {
  await page.getByLabel('Имя пользователя или email').fill(identifier)
  await page.getByLabel('Пароль', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Войти' }).click()
}

test('register → verify email → log out → log in', async ({ page }) => {
  const user = newUser()
  await register(page, user)

  const panel = page.getByRole('region', { name: 'Текущий пользователь' })
  await expect(panel).toContainText(user.username)
  await expect(page.getByText(`мы отправили письмо на ${user.email}`)).toBeVisible()

  const token = await tokenFromEmail(user.email, /подтвердите/i, '/verify-email')
  await page.goto(`/verify-email?token=${token}`)
  await expect(page.getByText('Email подтверждён')).toBeVisible()
  await page.getByRole('link', { name: 'Перейти в Chinchi' }).click()
  await expect(page.getByText(/Подтвердите email/)).toHaveCount(0)

  await logout(page)

  await login(page, user.email.toUpperCase(), user.password)
  await expect(page.getByRole('heading', { name: 'Друзья', level: 1 })).toBeVisible()
})

test('wrong password shows an error', async ({ page }) => {
  const user = newUser()
  await register(page, user)
  await logout(page)

  await login(page, user.username, 'definitely-wrong')

  await expect(page.getByRole('alert')).toHaveText('Неверное имя пользователя, email или пароль.')
})

test('taken username is reported on the field', async ({ page }) => {
  const user = newUser()
  await register(page, user)
  await logout(page)

  await page.goto('/register')
  await page.getByLabel('Email', { exact: true }).fill(`other_${user.email}`)
  await page.getByLabel('Имя пользователя').fill(user.username)
  await page.getByLabel('Пароль', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Продолжить' }).click()

  await expect(page.getByText('Это имя пользователя уже занято.')).toBeVisible()
})

test('forgot password → reset via email → log in with the new password', async ({ page }) => {
  const user = newUser()
  await register(page, user)
  await logout(page)

  await page.getByRole('link', { name: 'Забыли пароль?' }).click()
  await page.getByLabel('Email', { exact: true }).fill(user.email)
  await page.getByRole('button', { name: 'Отправить ссылку' }).click()
  await expect(page.getByRole('status')).toContainText('Если такой email зарегистрирован')

  const token = await tokenFromEmail(user.email, /сброс пароля/i, '/reset-password')
  await page.goto(`/reset-password?token=${token}`)
  await page.getByLabel('Новый пароль').fill('a-brand-new-password')
  await page.getByRole('button', { name: 'Сохранить пароль' }).click()
  await expect(page.getByRole('status')).toContainText('Пароль изменён')

  await page.getByRole('link', { name: 'Вернуться ко входу' }).click()
  await login(page, user.username, user.password)
  await expect(page.getByRole('alert')).toBeVisible()

  await page.getByLabel('Пароль', { exact: true }).fill('a-brand-new-password')
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('heading', { name: 'Друзья', level: 1 })).toBeVisible()
})

test('a protected page returns there after logging in', async ({ page }) => {
  const user = newUser()
  await register(page, user)
  await logout(page)

  await page.goto('/?tab=friends')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await login(page, user.username, user.password)

  await expect(page).toHaveURL(/\/\?tab=friends$/)
})
