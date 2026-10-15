import { expect, test } from '@playwright/test'

import { registerAndOpenHome } from '../support/auth'
import { createServerWithInvite } from '../support/guild'
import { newUser } from '../support/users'

/** A valid 1×1 PNG: enough for the magic-byte check and the preview worker. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
)

test('sends an image straight to storage and opens it in the viewer', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  const user = newUser()

  await registerAndOpenHome(page, user)
  await createServerWithInvite(page, `Файлы ${user.username}`)

  await page
    .getByLabel('Прикрепить файлы', { exact: true })
    .setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: PIXEL })
  await expect(page.getByRole('list', { name: 'Файлы к отправке' })).toContainText('pixel.png')
  await page.getByRole('textbox', { name: 'Сообщение в #общий' }).press('Enter')

  // Uploaded with a presigned PUT to RustFS, then attached to the message.
  const history = page.getByRole('list', { name: 'Сообщения в #общий' })
  const image = history.getByRole('img', { name: 'pixel.png' })
  await expect(image).toBeVisible()
  await expect
    .poll(() => image.evaluate((img) => (img as unknown as { naturalWidth: number }).naturalWidth))
    .toBe(1)

  await history.getByRole('button', { name: 'Открыть изображение pixel.png' }).click()
  const viewer = page.getByRole('dialog', { name: 'pixel.png' })
  await expect(viewer.getByRole('link', { name: 'Открыть оригинал' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()

  await context.close()
})
