import { expect, test } from '@playwright/test'

test('guests land on the login page', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Chinchi')
  await expect(page).toHaveURL(/\/login\?redirect=%2F$/)
  await expect(page.getByRole('heading', { name: 'С возвращением!' })).toBeVisible()
})

test('unknown routes show a 404 page', async ({ page }) => {
  await page.goto('/no/such/page')

  await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible()
})

test('pages load without unexpected console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    // Guests probing /users/@me get a 401 by design; the browser logs it as a failed resource.
    const isExpected401 = message.text().includes('status of 401')
    if (message.type() === 'error' && !isExpected401) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible()
  await page.goto('/register')
  await expect(page.getByRole('button', { name: 'Продолжить' })).toBeVisible()

  expect(errors).toEqual([])
})

test.describe('in an English browser', () => {
  test.use({ locale: 'en-US' })

  test('the interface is in English', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('heading', { name: 'Welcome back!' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })
})
