import { expect, test } from '@playwright/test'

import { registerAndOpenHome } from '../support/auth'
import { totpCode } from '../support/totp'
import { newUser } from '../support/users'

test('two-factor sign-in: turn it on, then sign in with a code', async ({ page }) => {
  const user = newUser()
  await registerAndOpenHome(page, user)

  await page.getByRole('link', { name: 'Настройки пользователя' }).click()
  await page.getByRole('button', { name: /^Двухфакторная аутентификация/ }).click()
  await page.getByRole('button', { name: 'Включить 2FA' }).click()
  const dialog = page.getByRole('dialog', { name: 'Двухфакторная аутентификация' })
  await dialog.getByLabel('Пароль', { exact: true }).fill(user.password)
  await dialog.getByRole('button', { name: 'Продолжить' }).click()
  await expect(dialog.getByRole('img', { name: 'QR-код для приложения' })).toBeVisible()
  const secret = (await dialog.locator('code').textContent())?.trim() ?? ''
  expect(secret).toMatch(/^[A-Z2-7]{32}$/)
  await dialog.getByLabel('Код из приложения', { exact: true }).fill(totpCode(secret))
  await dialog.getByRole('button', { name: 'Включить' }).click()
  const codes = dialog.getByRole('list', { name: 'Коды восстановления' })
  await expect(codes.getByRole('listitem')).toHaveCount(10)
  const recovery = (await codes.getByRole('listitem').first().textContent())?.trim() ?? ''
  await dialog.getByRole('button', { name: 'Я сохранил коды' }).click()
  await expect(page.getByText('Включена')).toBeVisible()

  const signIn = async (code: string) => {
    await page.keyboard.press('Escape')
    await page
      .getByRole('region', { name: 'Текущий пользователь' })
      .getByRole('button', { name: 'Выйти' })
      .click()
    await expect(page).toHaveURL(/\/login$/)
    await page.getByLabel('Имя пользователя или email').fill(user.username)
    await page.getByLabel('Пароль', { exact: true }).fill(user.password)
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    await page.getByLabel('Код подтверждения', { exact: true }).fill(code)
    await page.getByRole('button', { name: 'Подтвердить' }).click()
    await expect(page.getByRole('heading', { name: 'Друзья', level: 1 })).toBeVisible()
  }

  // The code used to turn it on is spent: the next one works.
  await signIn(totpCode(secret, 1))
  // So does a recovery code, once.
  await signIn(recovery)
})
