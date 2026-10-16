import { expect } from '@playwright/test'

import type { Page } from '@playwright/test'

const RECOVERY_KEY = /^[0-9A-Z]{4}(-[0-9A-Z]{4}){12}$/

/** The first encrypted conversation asks to save the recovery key: take it and say it's saved. */
export const saveRecoveryKey = async (page: Page): Promise<string> => {
  const dialog = page.getByRole('dialog', { name: 'Сохраните ключ восстановления' })
  const key = dialog.getByText(RECOVERY_KEY)
  await expect(key).toBeVisible()
  const text = await key.innerText()
  await dialog.getByRole('button', { name: 'Я сохранил ключ' }).click()
  await expect(dialog).toBeHidden()
  return text
}
