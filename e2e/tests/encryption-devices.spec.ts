import { expect, test } from '@playwright/test'

import { registerAndOpenHome } from '../support/auth'
import { saveRecoveryKey } from '../support/encryption'
import { befriend } from '../support/friends'
import { newUser } from '../support/users'

import type { TestUser } from '../support/auth'
import type { Browser, Page } from '@playwright/test'

/** How a user's devices get into encrypted conversations: re-registration, resets, approvals. */

const openAs = async (browser: Browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await context.addInitScript(() => localStorage.setItem('chinchi.e2ee.guideSeen', '1'))
  return { context, page: await context.newPage() }
}

const signIn = async (page: Page, user: TestUser) => {
  await page.goto('/login')
  await page.getByLabel('Имя пользователя или email', { exact: true }).fill(user.username)
  await page.getByLabel('Пароль', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Личные сообщения' })).toBeVisible()
}

const openEncrypted = (page: Page) =>
  page
    .getByRole('complementary', { name: 'Личные сообщения' })
    .getByRole('link', { name: /зашифрованная беседа/ })
    .click()

const composerOf = (page: Page, name: string) =>
  page.getByRole('textbox', { name: `Написать @${name}` })

const waitingOf = (page: Page) =>
  page.getByRole('status', { name: 'Это устройство пока не подключено к беседе' })

const say = async (page: Page, name: string, text: string) => {
  await composerOf(page, name).fill(text)
  await composerOf(page, name).press('Enter')
  await expect(page.getByText(text)).toBeVisible()
}

/** Alice and Bob, friends, talking in an encrypted DM that both have opened. */
const encryptedPair = async (browser: Browser) => {
  const alice = await openAs(browser)
  const bob = await openAs(browser)
  const aliceUser = newUser()
  const bobUser = newUser()
  await registerAndOpenHome(alice.page, aliceUser)
  await registerAndOpenHome(bob.page, bobUser)
  await befriend(alice.page, bob.page, aliceUser.username, bobUser.username)

  await alice.page.reload()
  await alice.page.getByRole('tab', { name: 'Все' }).click()
  await alice.page
    .getByRole('button', { name: new RegExp(`^${bobUser.username}`) })
    .first()
    .click()
  await alice.page.getByRole('button', { name: 'Зашифрованная беседа' }).click()
  const recoveryKey = await saveRecoveryKey(alice.page)
  const conversation = alice.page.url()
  await say(alice.page, bobUser.username, 'Привет от Алисы')

  await bob.page.goto('/')
  await openEncrypted(bob.page)
  await saveRecoveryKey(bob.page)
  await expect(bob.page.getByText('Привет от Алисы')).toBeVisible()
  await say(bob.page, aliceUser.username, 'Привет от Боба')
  await expect(alice.page.getByText('Привет от Боба')).toBeVisible()
  return { alice, bob, aliceUser, bobUser, recoveryKey, conversation }
}

/** This browser's encryption device, as the server lists it for the signed-in user. */
const ownDevices = (page: Page) =>
  page.evaluate(async () => {
    const response = await fetch('/api/v1/users/@me/devices')
    const { data } = (await response.json()) as {
      data: { devices: { id: string; revokedAt: string | null }[] }
    }
    return data.devices.filter((device) => !device.revokedAt).map((device) => device.id)
  })

test('a browser whose device was removed elsewhere waits, gets back in and writes again', async ({
  browser,
}) => {
  const { alice, bob, aliceUser, bobUser, recoveryKey, conversation } = await encryptedPair(browser)
  const [laptopDevice] = await ownDevices(alice.page)

  // Alice's phone (approved with the recovery key) removes the laptop's device.
  const phone = await openAs(browser)
  await signIn(phone.page, aliceUser)
  await openEncrypted(phone.page)
  const banner = phone.page.getByRole('status', { name: 'Старые сообщения недоступны' })
  await banner.getByRole('button', { name: 'Ввести ключ восстановления' }).click()
  await banner.getByLabel('Ключ восстановления', { exact: true }).fill(recoveryKey)
  await banner.getByRole('button', { name: 'Восстановить' }).click()
  await expect(banner).toBeHidden()
  const status = await phone.page.evaluate(
    async (id) => (await fetch(`/api/v1/users/@me/devices/${id}`, { method: 'DELETE' })).status,
    laptopDevice,
  )
  expect(status).toBeLessThan(300)

  // The laptop reloads with the same storage: a new device, never "couldn't set up encryption".
  await alice.page.goto(conversation)
  // What the old device read stays readable.
  await expect(alice.page.getByText('Привет от Боба')).toBeVisible()
  expect(await ownDevices(alice.page)).not.toContain(laptopDevice)

  // It holds the user key, so it vouches for itself and Bob lets it in, nobody reopening the chat.
  await expect(composerOf(alice.page, bobUser.username)).toBeVisible({ timeout: 30_000 })
  await expect(waitingOf(alice.page)).toBeHidden()
  await expect(alice.page.getByText('Не удалось подготовить шифрование')).toBeHidden()
  await say(alice.page, bobUser.username, 'Снова на ноутбуке')
  await expect(bob.page.getByText('Снова на ноутбуке')).toBeVisible()
  await say(bob.page, aliceUser.username, 'Вижу')
  await expect(alice.page.getByText('Вижу')).toBeVisible()

  await Promise.all([alice.context.close(), bob.context.close(), phone.context.close()])
})

test('after a reset of keys, devices approved with the new key get into the conversation', async ({
  browser,
}) => {
  const { alice, bob, aliceUser, bobUser, conversation } = await encryptedPair(browser)
  await alice.context.close()

  // Every device and the key are lost: a new browser resets the keys with the password.
  const phone = await openAs(browser)
  await signIn(phone.page, aliceUser)
  await phone.page.goto('/?settings=sessions')
  const settings = phone.page.getByRole('dialog', { name: /Настройки/ })
  await settings.getByRole('button', { name: 'Сбросить ключи шифрования' }).click()
  const reset = phone.page.getByRole('dialog', { name: 'Сбросить ключи шифрования?' })
  await reset.getByLabel('Пароль', { exact: true }).fill(aliceUser.password)
  await reset.getByRole('button', { name: 'Сбросить' }).click()
  await expect(reset).toBeHidden()
  await phone.page.goto(conversation)
  const newKey = await saveRecoveryKey(phone.page)
  await expect(waitingOf(phone.page)).toBeVisible()

  // Bob sees the reset; until he accepts the key, Alice's devices stay out.
  const warning = bob.page.getByRole('alert', { name: 'Новые устройства' })
  await expect(warning).toContainText('сбросил(а) ключи шифрования')
  await warning.getByRole('button', { name: `Принять новый ключ — ${aliceUser.username}` }).click()
  await expect(composerOf(phone.page, bobUser.username)).toBeVisible({ timeout: 30_000 })
  await say(phone.page, bobUser.username, 'Пишу с телефона после сброса')
  await expect(bob.page.getByText('Пишу с телефона после сброса')).toBeVisible()

  // Bob goes offline. A tablet takes the new key right in the waiting notice; the phone, which
  // made the key, trusts it and lets the tablet in from wherever it is in the app.
  await bob.page.goto('about:blank')
  await phone.page.goto('/')
  const tablet = await openAs(browser)
  await signIn(tablet.page, aliceUser)
  await tablet.page.goto(conversation)
  const waiting = waitingOf(tablet.page)
  await waiting.getByRole('button', { name: 'Ввести ключ восстановления' }).click()
  const enter = tablet.page.getByRole('dialog', { name: 'Ключ восстановления' })
  await enter.getByLabel('Ключ восстановления', { exact: true }).fill(newKey)
  await enter.getByRole('button', { name: 'Восстановить' }).click()
  await expect(composerOf(tablet.page, bobUser.username)).toBeVisible({ timeout: 30_000 })
  // History from after the reset came back with the key.
  await expect(tablet.page.getByText('Пишу с телефона после сброса')).toBeVisible()
  await say(tablet.page, bobUser.username, 'Пишу с планшета')

  // Bob comes back and reads it; his answer reaches both of Alice's new devices.
  await bob.page.goto(conversation)
  await expect(bob.page.getByText('Пишу с планшета')).toBeVisible()
  await say(bob.page, aliceUser.username, 'Обоих вижу')
  await expect(tablet.page.getByText('Обоих вижу')).toBeVisible()
  await phone.page.goto(conversation)
  await expect(phone.page.getByText('Обоих вижу')).toBeVisible()

  await Promise.all([bob.context.close(), phone.context.close(), tablet.context.close()])
})

test('a new device says the emoji differ: it takes no keys, though the other side said yes', async ({
  browser,
}) => {
  const laptop = await openAs(browser)
  const bob = await openAs(browser)
  const aliceUser = newUser()
  const bobUser = newUser()
  await registerAndOpenHome(laptop.page, aliceUser)
  await registerAndOpenHome(bob.page, bobUser)
  await befriend(laptop.page, bob.page, aliceUser.username, bobUser.username)
  await laptop.page.reload()
  await laptop.page.getByRole('tab', { name: 'Все' }).click()
  await laptop.page
    .getByRole('button', { name: new RegExp(`^${bobUser.username}`) })
    .first()
    .click()
  await laptop.page.getByRole('button', { name: 'Зашифрованная беседа' }).click()
  await saveRecoveryKey(laptop.page)
  const conversation = laptop.page.url()
  await laptop.page.goto('/')

  const phone = await openAs(browser)
  await signIn(phone.page, aliceUser)
  await phone.page.goto(conversation)
  const banner = phone.page.getByRole('status', { name: 'Старые сообщения недоступны' })
  await banner.getByRole('button', { name: 'Подтвердить с другого устройства' }).click()
  // Whoever answered said yes (here the laptop; it could as well be the server posing as one).
  const approve = laptop.page.getByRole('dialog', { name: 'Новый вход' })
  await approve.getByRole('button', { name: 'Да, эмодзи совпадают' }).click()
  await expect(banner).toContainText('На другом устройстве нажали «Да»')
  await banner.getByRole('button', { name: 'Нет, не совпадают' }).click()

  await expect(banner).toContainText('Вход не подтвердили')
  await phone.page.reload()
  await expect(
    phone.page.getByRole('status', { name: 'Старые сообщения недоступны' }),
  ).toBeVisible()
  const signed = await phone.page.evaluate(async () => {
    const response = await fetch('/api/v1/users/@me/devices')
    const { data } = (await response.json()) as {
      data: { devices: { userSignature: string | null }[] }
    }
    return data.devices.map((device) => Boolean(device.userSignature))
  })
  expect(signed.filter(Boolean)).toHaveLength(1)

  await Promise.all([laptop.context.close(), bob.context.close(), phone.context.close()])
})

test('a device approved by emoji gets into a group nobody has open', async ({ browser }) => {
  const [laptop, bob, carol] = await Promise.all([
    openAs(browser),
    openAs(browser),
    openAs(browser),
  ])
  const [aliceUser, bobUser, carolUser] = [newUser(), newUser(), newUser()]
  await registerAndOpenHome(laptop.page, aliceUser)
  await registerAndOpenHome(bob.page, bobUser)
  await registerAndOpenHome(carol.page, carolUser)
  await befriend(laptop.page, bob.page, aliceUser.username, bobUser.username)
  await befriend(laptop.page, carol.page, aliceUser.username, carolUser.username)

  await laptop.page.reload()
  await laptop.page
    .getByRole('complementary', { name: 'Личные сообщения' })
    .getByRole('button', { name: 'Создать группу' })
    .click()
  const create = laptop.page.getByRole('dialog', { name: 'Новая группа' })
  await create.getByLabel(bobUser.username, { exact: true }).check()
  await create.getByLabel(carolUser.username, { exact: true }).check()
  await create.getByRole('switch', { name: 'Зашифрованная беседа' }).click()
  await create.getByRole('button', { name: 'Создать группу' }).click()
  await saveRecoveryKey(laptop.page)
  const group = laptop.page.url()
  const composer = (page: Page) => page.getByRole('textbox', { name: /^Написать/ })
  await composer(laptop.page).fill('Всем привет')
  await composer(laptop.page).press('Enter')
  for (const person of [bob, carol]) {
    await person.page.goto(group)
    await saveRecoveryKey(person.page)
    await expect(person.page.getByText('Всем привет')).toBeVisible()
  }

  // Nobody has the group open while the phone is approved.
  await Promise.all([laptop, bob, carol].map((person) => person.page.goto('/')))
  const phone = await openAs(browser)
  await signIn(phone.page, aliceUser)
  await phone.page.goto(group)
  const banner = phone.page.getByRole('status', { name: 'Старые сообщения недоступны' })
  await banner.getByRole('button', { name: 'Подтвердить с другого устройства' }).click()
  // Yes on the phone first this time, then on the laptop.
  await banner.getByRole('button', { name: 'Да, эмодзи совпадают' }).click()
  await expect(banner).toContainText('нажмите там «Да»')
  const approve = laptop.page.getByRole('dialog', { name: 'Новый вход' })
  await approve.getByRole('button', { name: 'Да, эмодзи совпадают' }).click()
  await expect(approve).toBeHidden()

  // Let in in the background; it writes to the group, and everyone reads it.
  await expect(composer(phone.page)).toBeVisible({ timeout: 30_000 })
  await expect(phone.page.getByText('Всем привет')).toBeVisible()
  await composer(phone.page).fill('С телефона в группу')
  await composer(phone.page).press('Enter')
  for (const person of [bob, carol]) {
    await person.page.goto(group)
    await expect(person.page.getByText('С телефона в группу')).toBeVisible()
  }

  await Promise.all([laptop, bob, carol, phone].map((person) => person.context.close()))
})
