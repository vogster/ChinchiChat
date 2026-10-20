import { expect, test } from '@playwright/test'

import { newUser } from '../support/users'

test('change display name and password from settings', async ({ page }) => {
  const user = newUser()
  await page.goto('/register')
  await page.getByLabel('Email', { exact: true }).fill(user.email)
  await page.getByLabel('Имя пользователя', { exact: true }).fill(user.username)
  await page.getByLabel('Пароль', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Продолжить' }).click()

  // The settings open in a window over the chat.
  await page.getByRole('link', { name: 'Настройки пользователя' }).click()
  const settings = page.getByRole('dialog', { name: 'Настройки пользователя' })
  await expect(settings.getByRole('heading', { name: 'Моя учётная запись' })).toBeVisible()
  await expect(settings.getByText(user.email, { exact: true })).toBeVisible()

  await settings.getByRole('link', { name: 'Профиль' }).click()
  await settings.getByLabel('Отображаемое имя').fill('E2E Тестер')
  await settings.getByRole('button', { name: 'Сохранить' }).click()
  await expect(settings.getByText('Сохранено')).toBeVisible()

  await settings.getByRole('link', { name: 'Моя учётная запись' }).click()
  await settings.getByRole('button', { name: /^Пароль/ }).click()
  await settings.getByLabel('Текущий пароль').fill(user.password)
  await settings.getByLabel('Новый пароль', { exact: true }).fill('changed-password-123')
  await settings.getByLabel('Повторите новый пароль').fill('changed-password-123')
  await settings.getByRole('button', { name: 'Сменить пароль' }).click()
  await expect(settings.getByText(/Пароль изменён/)).toBeVisible()

  await settings.getByRole('link', { name: 'Устройства' }).click()
  await expect(
    settings.getByRole('list', { name: 'Устройства' }).getByText('Это устройство'),
  ).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(settings).toBeHidden()
  const panel = page.getByRole('region', { name: 'Текущий пользователь' })
  await expect(panel).toContainText('E2E Тестер')

  await panel.getByRole('button', { name: 'Выйти' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Имя пользователя или email').fill(user.username)
  await page.getByLabel('Пароль', { exact: true }).fill('changed-password-123')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Друзья', level: 1 })).toBeVisible()
})
