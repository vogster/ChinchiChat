import { expect } from '@playwright/test'

import type { newUser } from './users'
import type { Page } from '@playwright/test'

export type TestUser = ReturnType<typeof newUser>

/** Fills the registration form on the current /register page. */
export const fillRegistration = async (page: Page, user: TestUser) => {
  await page.getByLabel('Email', { exact: true }).fill(user.email)
  await page.getByLabel('Имя пользователя', { exact: true }).fill(user.username)
  await page.getByLabel('Пароль', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Продолжить' }).click()
}

export const registerAndOpenHome = async (page: Page, user: TestUser) => {
  await page.goto('/register')
  await fillRegistration(page, user)
  await expect(page.getByRole('heading', { name: 'Друзья', level: 1 })).toBeVisible()
}
