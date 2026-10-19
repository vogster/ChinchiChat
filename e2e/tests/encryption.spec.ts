import { expect, test } from '@playwright/test'

import { registerAndOpenHome } from '../support/auth'
import { saveRecoveryKey } from '../support/encryption'
import { befriend } from '../support/friends'
import { acceptInvite, createServerWithInvite } from '../support/guild'
import { messageAction } from '../support/messages'
import { newUser } from '../support/users'

import type { Browser } from '@playwright/test'

/** A valid 1×1 PNG. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
)

const openAs = async (browser: Browser, { guide = false }: { guide?: boolean } = {}) => {
  // Chromium's fake camera and microphone (see launch flags in the config) stand in for devices.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    permissions: ['microphone', 'camera'],
  })
  // The encryption guide opens once per browser; only the test that looks at it sees it.
  if (!guide) {
    await context.addInitScript(() => localStorage.setItem('chinchi.e2ee.guideSeen', '1'))
  }
  return { context, page: await context.newPage() }
}

test('two people talk and call in an encrypted conversation the server cannot read', async ({
  browser,
}) => {
  const alice = await openAs(browser, { guide: true })
  const bob = await openAs(browser)
  const aliceUser = newUser()
  const bobUser = newUser()

  await registerAndOpenHome(alice.page, aliceUser)
  const invite = await createServerWithInvite(alice.page, `Шифр ${aliceUser.username}`)
  await registerAndOpenHome(bob.page, bobUser)
  await acceptInvite(bob.page, invite)
  // Bob's browser became an encryption device when it opened the app, vouched for by his
  // user key (the first device creates it; the server checked the signature).
  await expect
    .poll(() =>
      bob.page.evaluate(async () => {
        const response = await fetch('/api/v1/users/@me/devices')
        const { data } = (await response.json()) as {
          data: { devices: { userSignature: string | null }[] }
        }
        return data.devices.map((device) => Boolean(device.userSignature))
      }),
    )
    .toEqual([true])

  // Alice starts an encrypted conversation from Bob's card.
  const members = alice.page.getByRole('complementary', { name: /Участники/ })
  await members.getByRole('button', { name: new RegExp(`^${bobUser.username},`) }).click()
  await alice.page.getByRole('button', { name: 'Зашифрованная беседа' }).click()
  // The first encrypted conversation in this browser starts with the guide, then the key.
  const guide = alice.page.getByRole('dialog', { name: 'Как работает шифрование' })
  await expect(guide).toContainText('Шаг 1 из 5')
  await guide.getByRole('button', { name: 'Закрыть' }).click()
  await expect(alice.page.getByText('Сквозное шифрование')).toBeVisible()
  await saveRecoveryKey(alice.page)

  const aliceComposer = alice.page.getByRole('textbox', { name: `Написать @${bobUser.username}` })
  await aliceComposer.fill('Пароль от сейфа: 4242')
  await aliceComposer.press('Enter')

  // Bob opens it from his DM list and reads the decrypted text.
  await bob.page.goto('/')
  await bob.page
    .getByRole('complementary', { name: 'Личные сообщения' })
    .getByRole('link', { name: new RegExp(`^${aliceUser.username}.*зашифрованная беседа`) })
    .click()
  await saveRecoveryKey(bob.page)
  await expect(bob.page.getByText('Пароль от сейфа: 4242')).toBeVisible()

  const bobComposer = bob.page.getByRole('textbox', { name: `Написать @${aliceUser.username}` })
  await bobComposer.fill('Принято, сожгу после прочтения')
  await bobComposer.press('Enter')
  await expect(alice.page.getByText('Принято, сожгу после прочтения')).toBeVisible()

  // Search works on the device, over what it decrypted.
  await alice.page.getByRole('searchbox', { name: 'Поиск' }).fill('сейф')
  await alice.page.getByRole('searchbox', { name: 'Поиск' }).press('Enter')
  const results = alice.page.getByRole('complementary', { name: 'Результаты поиска' })
  await expect(results).toContainText('Пароль от сейфа: 4242')
  await results.getByRole('button', { name: 'Закрыть поиск' }).click()

  // Bob reacts; Alice sees it, the server only holds an encrypted set.
  // Message actions open with a right click.
  const bobRow = bob.page.getByText('Пароль от сейфа: 4242').locator('xpath=ancestor::li[1]')
  await (await messageAction(bob.page, 'Пароль от сейфа: 4242', 'Отреагировать: 😂')).click()
  const aliceRow = alice.page.getByText('Пароль от сейфа: 4242').locator('xpath=ancestor::li[1]')
  await expect(aliceRow.getByRole('button', { name: '😂: 1' })).toBeVisible()
  await expect(bobRow.getByRole('button', { name: '😂: 1, вы среди них' })).toBeVisible()

  // What the server stores is ciphertext: the API never returns the text.
  const channelId = alice.page.url().split('/').at(-1) as string
  const stored = await alice.page.evaluate(async (id) => {
    const response = await fetch(`/api/v1/channels/${id}/messages`)
    return JSON.stringify(await response.json())
  }, channelId)
  expect(stored).not.toContain('4242')
  expect(stored).toContain('"ciphertext"')
  expect(stored).not.toContain('😂')
  expect(stored).toContain('"encryptedReactions"')

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
  await alice.page
    .getByRole('region', { name: 'Управление звонком' })
    .getByRole('button', { name: 'Камера' })
    .click()
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
  await saveRecoveryKey(alice.page)
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
    await saveRecoveryKey(page)
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

test('a new browser gets the old messages back with the recovery key', async ({ browser }) => {
  const alice = await openAs(browser)
  const bob = await openAs(browser)
  const aliceUser = newUser()
  const bobUser = newUser()
  await registerAndOpenHome(alice.page, aliceUser)
  await registerAndOpenHome(bob.page, bobUser)
  await befriend(alice.page, bob.page, aliceUser.username, bobUser.username)

  // Alice talks to Bob and keeps her recovery key.
  await alice.page.reload()
  await alice.page.getByRole('tab', { name: 'Все' }).click()
  await alice.page
    .getByRole('button', { name: new RegExp(`^${bobUser.username}`) })
    .first()
    .click()
  await alice.page.getByRole('button', { name: 'Зашифрованная беседа' }).click()
  await expect(alice.page.getByText('Сквозное шифрование')).toBeVisible()
  const recoveryKey = await saveRecoveryKey(alice.page)
  const composer = alice.page.getByRole('textbox', { name: `Написать @${bobUser.username}` })
  await composer.fill('Код от домофона: 77')
  await composer.press('Enter')
  await expect(alice.page.getByText('Код от домофона: 77')).toBeVisible()
  // The message is in the history backup (encrypted) before the old browser is gone.
  const channelId = alice.page.url().split('/').at(-1) as string
  await expect
    .poll(() =>
      alice.page.evaluate(async (id) => {
        const response = await fetch(`/api/v1/users/@me/e2ee/backup/entries?channelId=${id}`)
        return ((await response.json()) as { data: { entries: unknown[] } }).data.entries.length
      }, channelId),
    )
    .toBeGreaterThan(0)
  await alice.context.close()

  // A new browser: signed in, but its device was not there for the message.
  const fresh = await openAs(browser)
  await fresh.page.goto('/login')
  await fresh.page
    .getByLabel('Имя пользователя или email', { exact: true })
    .fill(aliceUser.username)
  await fresh.page.getByLabel('Пароль', { exact: true }).fill(aliceUser.password)
  await fresh.page.getByRole('button', { name: 'Войти' }).click()
  await fresh.page
    .getByRole('complementary', { name: 'Личные сообщения' })
    .getByRole('link', { name: /зашифрованная беседа/ })
    .click()
  const banner = fresh.page.getByRole('status', { name: 'Старые сообщения недоступны' })
  await expect(banner).toBeVisible()
  await expect(
    fresh.page.getByText(
      '1 сообщение отправлено до подключения этого устройства и недоступно на нём',
    ),
  ).toBeVisible()

  // Typed right in the notice, not in a window.
  await banner.getByRole('button', { name: 'Ввести ключ восстановления' }).click()
  await banner.getByLabel('Ключ восстановления', { exact: true }).fill(recoveryKey.toLowerCase())
  await banner.getByRole('button', { name: 'Восстановить' }).click()
  await expect(banner).toBeHidden()

  // The old message reads again here, and this browser is vouched for by Alice's user key.
  await fresh.page.reload()
  await expect(fresh.page.getByText('Код от домофона: 77')).toBeVisible()
  await expect(banner).toBeHidden()
  const signed = await fresh.page.evaluate(async () => {
    const response = await fetch('/api/v1/users/@me/devices')
    const { data } = (await response.json()) as {
      data: { devices: { userSignature: string | null }[] }
    }
    return data.devices.map((device) => Boolean(device.userSignature))
  })
  expect(signed).toEqual([true, true])

  await fresh.context.close()
  await bob.context.close()
})

test('a new browser is approved from an old one by comparing emoji', async ({ browser }) => {
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
  const composer = laptop.page.getByRole('textbox', { name: `Написать @${bobUser.username}` })
  await composer.fill('Встречаемся у фонтана')
  await composer.press('Enter')
  await expect(laptop.page.getByText('Встречаемся у фонтана')).toBeVisible()
  // What the laptop has put in the history backup for this conversation (sealed, so compared
  // as is): the message first, then the message again with Bob's reaction.
  const laptopChannel = laptop.page.url().split('/').at(-1) as string
  const backedUp = () =>
    laptop.page.evaluate(async (id) => {
      const response = await fetch(`/api/v1/users/@me/e2ee/backup/entries?channelId=${id}`)
      const { data } = (await response.json()) as { data: { entries: { payload: string }[] } }
      return data.entries.map((entry) => entry.payload).join('|')
    }, laptopChannel)
  await expect.poll(backedUp).not.toBe('')
  const withoutReaction = await backedUp()
  // Bob reacts; the laptop reads the reaction (and so backs it up with the message).
  await bob.page.goto('/')
  await bob.page
    .getByRole('complementary', { name: 'Личные сообщения' })
    .getByRole('link', { name: /зашифрованная беседа/ })
    .click()
  await saveRecoveryKey(bob.page)
  await (await messageAction(bob.page, 'Встречаемся у фонтана', 'Отреагировать: 👍')).click()
  const laptopRow = laptop.page.getByText('Встречаемся у фонтана').locator('xpath=ancestor::li[1]')
  await expect(laptopRow.getByRole('button', { name: '👍: 1' })).toBeVisible()
  // The backup goes up in the background: leaving before it does loses the reaction.
  await expect.poll(backedUp).not.toBe(withoutReaction)
  await laptop.page.goto('/')

  // Alice signs in on her phone; the laptop stays open.
  const phone = await openAs(browser)
  await phone.page.goto('/login')
  await phone.page
    .getByLabel('Имя пользователя или email', { exact: true })
    .fill(aliceUser.username)
  await phone.page.getByLabel('Пароль', { exact: true }).fill(aliceUser.password)
  await phone.page.getByRole('button', { name: 'Войти' }).click()
  await phone.page
    .getByRole('complementary', { name: 'Личные сообщения' })
    .getByRole('link', { name: /зашифрованная беседа/ })
    .click()
  const banner = phone.page.getByRole('status', { name: 'Старые сообщения недоступны' })
  await banner.getByRole('button', { name: 'Подтвердить с другого устройства' }).click()

  // Both screens show the same six emoji; Alice says yes on the laptop.
  const dialog = laptop.page.getByRole('dialog', { name: 'Новый вход' })
  await expect(dialog).toContainText('Это вы?')
  const onLaptop = dialog.getByRole('group', { name: 'Эмодзи для сравнения' })
  const onPhone = banner.getByRole('group', { name: 'Эмодзи для сравнения' })
  await expect(onLaptop).toBeVisible()
  await expect(onPhone).toBeVisible()
  expect(await onPhone.innerText()).toBe(await onLaptop.innerText())
  await dialog.getByRole('button', { name: 'Да, эмодзи совпадают' }).click()
  await expect(dialog).toBeHidden()

  // The phone now reads the message from before it existed, and is vouched for.
  await expect(banner).toBeHidden()
  await phone.page.reload()
  await expect(phone.page.getByText('Встречаемся у фонтана')).toBeVisible()
  // The reaction from before the phone existed came back with the history.
  await expect(
    phone.page
      .getByText('Встречаемся у фонтана')
      .locator('xpath=ancestor::li[1]')
      .getByRole('button', { name: '👍: 1' }),
  ).toBeVisible()
  const signed = await phone.page.evaluate(async () => {
    const response = await fetch('/api/v1/users/@me/devices')
    const { data } = (await response.json()) as {
      data: { devices: { userSignature: string | null }[] }
    }
    return data.devices.map((device) => Boolean(device.userSignature))
  })
  expect(signed).toEqual([true, true])

  await Promise.all([laptop.context.close(), phone.context.close(), bob.context.close()])
})
