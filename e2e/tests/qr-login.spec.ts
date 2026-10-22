import { expect, test } from '@playwright/test'

import { registerAndOpenHome } from '../support/auth'
import { newUser } from '../support/users'

import type { Browser, Page } from '@playwright/test'

const FRIENDS = { name: 'Друзья', level: 1 } as const

/** A second browser on the login page, showing its sign-in QR; returns what the QR holds. */
const showQr = async (browser: Browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  // On a wide screen the QR is beside the password fields from the start.
  const created = page.waitForResponse(
    (response) => response.url().endsWith('/api/v1/auth/qr') && response.status() === 201,
  )
  await page.goto('/login')
  const { ticket } = (await (await created).json()).data as {
    ticket: { url: string; code: string }
  }
  await expect(page.getByRole('img', { name: 'QR-код для входа' })).toBeVisible()
  await expect(page.getByText(ticket.code)).toBeVisible()
  return { context, page, ...ticket }
}

/**
 * Picks the number the new device shows once the approval is open, as its owner reads it off
 * that screen (it is nowhere before: not on the login page, not in the QR).
 */
const letIn = async (page: Page, newDevice: Page) => {
  const dialog = page.getByRole('dialog', { name: 'Вход на новом устройстве' })
  await expect(dialog.getByText(/это мошенники/)).toBeVisible()
  const shown = newDevice.getByRole('status', { name: 'Число для подтверждения' })
  await expect(shown).toHaveText(/^\d{2}$/)
  await expect(newDevice.getByRole('img', { name: 'QR-код для входа' })).toBeHidden()
  await dialog
    .getByRole('group', { name: 'Число с нового устройства' })
    .getByRole('button', { name: (await shown.textContent()) ?? '', exact: true })
    .click()
  await expect(dialog.getByText('Готово: устройство входит в аккаунт.')).toBeVisible()
}

test('a new device signs in by a QR scanned on a signed-in one', async ({ page, browser }) => {
  const user = newUser()
  await registerAndOpenHome(page, user)
  const other = await showQr(browser)

  // The phone's camera opens the link from the QR in the browser where the user is signed in.
  await page.goto(other.url)
  await letIn(page, other.page)

  await expect(other.page.getByRole('heading', FRIENDS)).toBeVisible()
  await expect(
    other.page.getByRole('region', { name: 'Текущий пользователь' }).getByText(user.username),
  ).toBeVisible()
  await other.context.close()
})

test('a new device signs in by the short code typed on a signed-in one', async ({
  page,
  browser,
}) => {
  const user = newUser()
  await registerAndOpenHome(page, user)
  const other = await showQr(browser)

  await page.getByRole('link', { name: 'Настройки пользователя' }).click()
  await page.getByRole('link', { name: 'Устройства', exact: true }).click()
  await page.getByLabel('Код со второго устройства', { exact: true }).fill(other.code)
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await letIn(page, other.page)

  await expect(other.page.getByRole('heading', FRIENDS)).toBeVisible()
  await other.context.close()
})
