import { expect } from '@playwright/test'

import type { Page } from '@playwright/test'

/** Creates a server from the current page and returns a fresh invite link to it. */
export const createServerWithInvite = async (page: Page, name: string): Promise<string> => {
  await page.getByRole('button', { name: 'Добавить сервер' }).click()
  const dialog = page.getByRole('dialog', { name: 'Создайте свой сервер' })
  await dialog.getByLabel('Название сервера').fill(name)
  await dialog.getByRole('button', { name: 'Создать' }).click()
  await expect(page.getByRole('heading', { name: 'общий', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: `Меню сервера ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Пригласить людей' }).click()
  const link = page.getByLabel('Ссылка-приглашение')
  await expect(link).toHaveValue(/\/invite\/[A-Za-z0-9]{8}$/)
  const url = await link.inputValue()
  await page.keyboard.press('Escape')
  return url
}

export const acceptInvite = async (page: Page, url: string) => {
  await page.goto(url)
  await page.getByRole('button', { name: 'Принять приглашение' }).click()
  await expect(page.getByRole('heading', { name: 'общий', level: 1 })).toBeVisible()
}
