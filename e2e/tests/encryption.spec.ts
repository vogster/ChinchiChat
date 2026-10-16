import { expect, test } from '@playwright/test'

import { registerAndOpenHome } from '../support/auth'
import { befriend } from '../support/friends'
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

  // Both see the same safety code for each other: compared, it proves the devices are theirs.
  const codeOf = async (page: typeof alice.page, name: string) => {
    await page.getByRole('button', { name: 'Проверка шифрования' }).click()
    const person = page
      .getByRole('dialog', { name: 'Проверка шифрования' })
      .getByRole('group', { name })
    await expect(person).toContainText(/\d{5} \d{5} \d{5} \d{5}/)
    const code = (
      await person.getByRole('group', { name: 'Код безопасности' }).innerText()
    ).replace(/\s+/g, '')
    await page.keyboard.press('Escape')
    return code
  }
  const aliceSees = await codeOf(alice.page, bobUser.username)
  expect(aliceSees).toMatch(/^\d{60}$/)
  expect(await codeOf(bob.page, aliceUser.username)).toBe(aliceSees)

  // Bob's settings list the browser that holds his keys: this one, the only one.
  await bob.page.goto('/settings/sessions')
  const keys = bob.page.getByRole('list', { name: 'Ключи шифрования' })
  await expect(keys.getByRole('listitem')).toHaveCount(1)
  await expect(keys).toContainText('Это устройство')
  await bob.page.goBack()

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

test('three people talk in an encrypted group, and one who leaves is left out', async ({
  browser,
}) => {
  const [alice, bob, carol] = await Promise.all([openAs(browser), openAs(browser), openAs(browser)])
  const [aliceUser, bobUser, carolUser] = [newUser(), newUser(), newUser()]
  await registerAndOpenHome(alice.page, aliceUser)
  await registerAndOpenHome(bob.page, bobUser)
  await registerAndOpenHome(carol.page, carolUser)
  await befriend(alice.page, bob.page, aliceUser.username, bobUser.username)
  await befriend(alice.page, carol.page, aliceUser.username, carolUser.username)

  // Alice starts an encrypted group with both of them.
  await alice.page.reload()
  await alice.page
    .getByRole('complementary', { name: 'Личные сообщения' })
    .getByRole('button', { name: 'Создать группу' })
    .click()
  const dialog = alice.page.getByRole('dialog', { name: 'Новая группа' })
  await dialog.getByLabel(bobUser.username, { exact: true }).check()
  await dialog.getByLabel(carolUser.username, { exact: true }).check()
  await dialog.getByRole('switch', { name: 'Зашифрованная беседа' }).click()
  await dialog.getByRole('button', { name: 'Создать группу' }).click()
  await expect(alice.page.getByText('Сквозное шифрование')).toBeVisible()
  const channelId = alice.page.url().split('/').at(-1) as string

  const composer = (page: typeof alice.page) => page.getByRole('textbox', { name: /^Написать/ })
  const say = async (page: typeof alice.page, text: string) => {
    await composer(page).fill(text)
    await composer(page).press('Enter')
  }
  const openGroup = async (page: typeof alice.page) => {
    await page.goto('/')
    await page
      .getByRole('complementary', { name: 'Личные сообщения' })
      .getByRole('link', { name: /зашифрованная беседа/ })
      .click()
  }

  await say(alice.page, 'Всем привет')
  for (const person of [bob, carol]) {
    await openGroup(person.page)
    await expect(person.page.getByText('Всем привет')).toBeVisible()
  }
  await say(carol.page, 'Привет от Кэрол')
  await expect(alice.page.getByText('Привет от Кэрол')).toBeVisible()
  await expect(bob.page.getByText('Привет от Кэрол')).toBeVisible()

  /** The group's epoch, as the commits the server ordered say (each commit moves it on). */
  const epochOf = (page: typeof alice.page) =>
    page.evaluate(async (id) => {
      const devices = (await (await fetch('/api/v1/users/@me/devices')).json()) as {
        data: { devices: { id: string }[] }
      }
      const deviceId = devices.data.devices[0]?.id ?? ''
      const response = await fetch(`/api/v1/channels/${id}/e2ee/handshakes?deviceId=${deviceId}`)
      const { data } = (await response.json()) as {
        data: { handshakes: { kind: string; epoch: number }[] }
      }
      return Math.max(-1, ...data.handshakes.filter((h) => h.kind === 'commit').map((h) => h.epoch))
    }, channelId)
  const epochWithCarol = await epochOf(alice.page)

  // Carol leaves; the next message is encrypted for Alice's and Bob's devices only.
  await carol.page.getByRole('button', { name: 'Покинуть группу' }).click()
  await carol.page
    .getByRole('dialog', { name: 'Покинуть группу' })
    .getByRole('button', { name: 'Покинуть группу' })
    .click()
  await expect(carol.page).not.toHaveURL(new RegExp(channelId))
  await expect(alice.page.getByText(`${carolUser.username} покинул(а) группу`)).toBeVisible()

  await say(alice.page, 'Уже без Кэрол')
  await expect(bob.page.getByText('Уже без Кэрол')).toBeVisible()
  // Sending first took Carol's device out of the group: a commit, new keys she never got.
  expect(await epochOf(alice.page)).toBeGreaterThan(epochWithCarol)
  await say(bob.page, 'Согласен')
  await expect(alice.page.getByText('Согласен')).toBeVisible()

  // Carol can't reach the conversation any more, and the server only ever had ciphertext.
  const carolStatus = await carol.page.evaluate(
    async (id) => (await fetch(`/api/v1/channels/${id}/messages`)).status,
    channelId,
  )
  expect(carolStatus).toBe(404)
  const stored = await alice.page.evaluate(async (id) => {
    const response = await fetch(`/api/v1/channels/${id}/messages`)
    return JSON.stringify(await response.json())
  }, channelId)
  for (const text of ['Всем привет', 'Привет от Кэрол', 'Уже без Кэрол', 'Согласен']) {
    expect(stored).not.toContain(text)
  }

  await Promise.all([alice.context.close(), bob.context.close(), carol.context.close()])
})
