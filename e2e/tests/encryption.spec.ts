import { expect, test } from '@playwright/test'

import { registerAndOpenHome } from '../support/auth'
import { acceptInvite, createServerWithInvite } from '../support/guild'
import { newUser } from '../support/users'

import type { Browser } from '@playwright/test'

/** A valid 1×1 PNG. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
)

const openAs = async (browser: Browser) => {
  // Chromium's fake camera and microphone (see launch flags in the config) stand in for devices.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    permissions: ['microphone', 'camera'],
  })
  return { context, page: await context.newPage() }
}

test('two people talk and call in an encrypted conversation the server cannot read', async ({
  browser,
}) => {
  const alice = await openAs(browser)
  const bob = await openAs(browser)
  const aliceUser = newUser()
  const bobUser = newUser()

  await registerAndOpenHome(alice.page, aliceUser)
  const invite = await createServerWithInvite(alice.page, `Шифр ${aliceUser.username}`)
  await registerAndOpenHome(bob.page, bobUser)
  await acceptInvite(bob.page, invite)
  // Bob's browser became an encryption device when it opened the app.
  await expect
    .poll(() =>
      bob.page.evaluate(async () => {
        const response = await fetch('/api/v1/users/@me/devices')
        return ((await response.json()) as { data: { devices: unknown[] } }).data.devices.length
      }),
    )
    .toBe(1)

  // Alice starts an encrypted conversation from Bob's card.
  const members = alice.page.getByRole('complementary', { name: /Участники/ })
  await members.getByRole('button', { name: new RegExp(`^${bobUser.username},`) }).click()
  await alice.page.getByRole('button', { name: 'Зашифрованная беседа' }).click()
  await expect(alice.page.getByText('Сквозное шифрование')).toBeVisible()

  const aliceComposer = alice.page.getByRole('textbox', { name: `Написать @${bobUser.username}` })
  await aliceComposer.fill('Пароль от сейфа: 4242')
  await aliceComposer.press('Enter')

  // Bob opens it from his DM list and reads the decrypted text.
  await bob.page.goto('/')
  await bob.page
    .getByRole('complementary', { name: 'Личные сообщения' })
    .getByRole('link', { name: new RegExp(`^${aliceUser.username}.*зашифрованная беседа`) })
    .click()
  await expect(bob.page.getByText('Пароль от сейфа: 4242')).toBeVisible()

  const bobComposer = bob.page.getByRole('textbox', { name: `Написать @${aliceUser.username}` })
  await bobComposer.fill('Принято, сожгу после прочтения')
  await bobComposer.press('Enter')
  await expect(alice.page.getByText('Принято, сожгу после прочтения')).toBeVisible()

  // What the server stores is ciphertext: the API never returns the text.
  const channelId = alice.page.url().split('/').at(-1) as string
  const stored = await alice.page.evaluate(async (id) => {
    const response = await fetch(`/api/v1/channels/${id}/messages`)
    return JSON.stringify(await response.json())
  }, channelId)
  expect(stored).not.toContain('4242')
  expect(stored).toContain('"ciphertext"')

  // Files are encrypted before upload: Bob sees the picture, the server only a generic blob.
  await alice.page
    .getByLabel('Прикрепить файлы', { exact: true })
    .setInputFiles({ name: 'карта.png', mimeType: 'image/png', buffer: PIXEL })
  await aliceComposer.press('Enter')
  const picture = bob.page.getByRole('img', { name: 'карта.png' })
  await expect(picture).toBeVisible()
  await expect
    .poll(() => picture.evaluate((img) => (img as { naturalWidth: number }).naturalWidth))
    .toBe(1)
  const files = await alice.page.evaluate(async (id) => {
    const response = await fetch(`/api/v1/channels/${id}/messages`)
    const { data } = (await response.json()) as {
      data: { messages: { attachments: { filename: string; contentType: string }[] }[] }
    }
    return data.messages.flatMap((message) => message.attachments)
  }, channelId)
  expect(files).toEqual([
    expect.objectContaining({ filename: 'encrypted', contentType: 'application/octet-stream' }),
  ])

  // A call here is encrypted end to end with the conversation's key: Bob sees Alice's camera,
  // which he could not decode with any other key.
  await alice.page.getByRole('button', { name: 'Позвонить' }).click()
  const alicePanel = alice.page.getByRole('region', { name: 'Голосовое подключение' })
  await expect(alicePanel).toContainText('Звонок зашифрован')
  await bob.page
    .getByRole('alertdialog', { name: 'Входящий звонок' })
    .getByRole('button', { name: 'Принять' })
    .click()
  await expect(bob.page.getByRole('region', { name: 'Голосовое подключение' })).toContainText(
    'Звонок зашифрован',
  )
  await alice.page.getByRole('button', { name: 'Включить камеру' }).click()
  const aliceVideo = bob.page
    .getByRole('list', { name: 'Участники звонка' })
    .getByRole('listitem', { name: new RegExp(`^${aliceUser.username}`) })
    .locator('video')
  await expect(aliceVideo).toBeVisible()
  await expect
    .poll(() => aliceVideo.evaluate((video) => (video as { videoWidth: number }).videoWidth), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0)
  // The media went through LiveKit's encryption worker, not a plain connection.
  for (const { page } of [alice, bob]) {
    const workers = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => name.includes('e2ee.worker')),
    )
    expect(workers.length).toBeGreaterThan(0)
  }

  await alice.context.close()
  await bob.context.close()
})
