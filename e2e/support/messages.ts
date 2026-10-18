import { expect, type Page } from '@playwright/test'

/**
 * Right-clicks a message and picks an action from its menu. A message still being sent has no
 * menu yet (the browser's shows instead), so the right click is retried until it opens.
 */
export const messageAction = async (page: Page, text: string, action: string | RegExp) => {
  const item = page.getByRole('menuitem', { name: action })
  await expect(async () => {
    await page.keyboard.press('Escape')
    await page.getByText(text).first().click({ button: 'right' })
    await expect(item).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  return item
}
