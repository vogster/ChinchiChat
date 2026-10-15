import { expect, test } from '@playwright/test'

import { newUser } from '../support/users'

test('change display name and password from settings', async ({ page }) => {
  const user = newUser()
  await page.goto('/register')
  await page.getByLabel('Email', { exact: true }).fill(user.email)
  await page.getByLabel('Имя пользователя', { exact: true }).fill(user.username)
  await page.getByLabel('Пароль', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Продолжить' }).click()

  await page.getByRole('link', { name: 'Настройки пользователя' }).click()
  await expect(page.getByRole('heading', { name: 'Моя учётная запись' })).toBeVisible()
  await expect(page.getByText(user.email)).toBeVisible()

  await page.getByRole('link', { name: 'Профиль' }).click()
  await page.getByLabel('Отображаемое имя').fill('E2E Тестер')
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByText('Сохранено')).toBeVisible()

  await page.getByRole('link', { name: 'Моя учётная запись' }).click()
  await page.getByLabel('Текущий пароль').fill(user.password)
  await page.getByLabel('Новый пароль', { exact: true }).fill('changed-password-123')
  await page.getByLabel('Повторите новый пароль').fill('changed-password-123')
  await page.getByRole('button', { name: 'Сменить пароль' }).click()
  await expect(page.getByText(/Пароль изменён/)).toBeVisible()

  await page.getByRole('link', { name: 'Устройства' }).click()
  await expect(page.getByText('Это устройство')).toBeVisible()

  await page.keyboard.press('Escape')
  const panel = page.getByRole('region', { name: 'Текущий пользователь' })
  await expect(panel).toContainText('E2E Тестер')

  await panel.getByRole('button', { name: 'Выйти' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Имя пользователя или email').fill(user.username)
  await page.getByLabel('Пароль', { exact: true }).fill('changed-password-123')
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('heading', { name: 'Друзья', level: 1 })).toBeVisible()
})
