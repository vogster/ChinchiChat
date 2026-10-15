import { expect, test } from '@playwright/test'

import { registerAndOpenHome } from '../support/auth'
import { createServerWithInvite } from '../support/guild'
import { newUser } from '../support/users'

import type { Browser, Page } from '@playwright/test'

/** A valid 1×1 PNG: enough for the magic-byte check and the emoji resize. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
)

/** A signed-in owner on a fresh server; wide enough for the search panel. */
const ownerOnServer = async (browser: Browser, prefix: string) => {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()
  const user = newUser()
  const serverName = `${prefix} ${user.username}`
  await registerAndOpenHome(page, user)
  await createServerWithInvite(page, serverName)
  return { context, page, user, serverName }
}

const composer = (page: Page, channel = 'общий') =>
  page.getByRole('textbox', { name: `Сообщение в #${channel}` })
const history = (page: Page, channel = 'общий') =>
  page.getByRole('list', { name: `Сообщения в #${channel}` })

const say = async (page: Page, text: string, channel = 'общий') => {
  await composer(page, channel).fill(text)
  await composer(page, channel).press('Enter')
  await expect(history(page, channel)).toContainText(text)
}

const openChannelSettings = async (page: Page, channel = 'общий') => {
  await page.getByRole('button', { name: `Настроить канал ${channel}`, exact: true }).click()
  return page.getByRole('dialog', { name: 'Настройки канала' })
}

test('a thread grows out of a message, opens beside it and in full', async ({ browser }) => {
  const { context, page } = await ownerOnServer(browser, 'Треды')
  await say(page, 'Обсудим релиз?')

  const message = history(page).getByRole('listitem').filter({ hasText: 'Обсудим релиз?' })
  await message.hover()
  await message.getByRole('button', { name: 'Создать тред' }).click()
  const dialog = page.getByRole('dialog', { name: 'Новый тред' })
  await dialog.getByLabel('Название треда', { exact: true }).fill('Релиз')
  await dialog.getByRole('button', { name: 'Создать' }).click()

  // The new thread opens beside its channel.
  const panel = page.getByRole('complementary', { name: 'Тред «Релиз»' })
  await expect(panel).toBeVisible()
  await say(page, 'Готовлю заметки', 'Релиз')
  await expect(history(page).getByRole('link', { name: /^Тред «Релиз» — 1/ })).toBeVisible()

  await panel.getByRole('link', { name: 'Открыть тред целиком' }).click()
  await expect(page.getByRole('heading', { name: 'Релиз', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: 'Вернуться в #общий' }).click()
  await expect(history(page).getByRole('link', { name: /^Тред «Релиз» — 1/ })).toBeVisible()
  await context.close()
})

test('search finds a message and jumps to it', async ({ browser }) => {
  const { context, page } = await ownerOnServer(browser, 'Поиск')
  await say(page, 'Пароль от вайфая на холодильнике')
  await say(page, 'Что-то совсем другое')

  const box = page.getByRole('searchbox', { name: 'Поиск' })
  await box.fill('холодильник')
  await box.press('Enter')
  const results = page.getByRole('complementary', { name: 'Результаты поиска' })
  await expect(results).toContainText('Найдено: 1')
  await expect(results).toContainText('Пароль от вайфая на холодильнике')
  await expect(results).not.toContainText('Что-то совсем другое')

  await results.getByRole('button', { name: 'Перейти' }).click()
  await expect(history(page).getByText('Пароль от вайфая на холодильнике')).toBeInViewport()
  await context.close()
})

test('a server emoji is uploaded and shows up in messages', async ({ browser }) => {
  const { context, page, serverName } = await ownerOnServer(browser, 'Эмодзи')
  const emojiName = `cat_${Date.now().toString(36)}`

  await page.getByRole('button', { name: `Меню сервера ${serverName}` }).click()
  await page.getByRole('menuitem', { name: 'Настройки сервера' }).click()
  await page.getByRole('link', { name: 'Эмодзи', exact: true }).click()
  await page.getByLabel('Название', { exact: true }).fill(emojiName)
  await page
    .getByLabel('Загрузить эмодзи', { exact: true })
    .setInputFiles({ name: 'cat.png', mimeType: 'image/png', buffer: PIXEL })
  const list = page.getByRole('list', { name: 'Эмодзи сервера' })
  await expect(list.getByRole('img', { name: `:${emojiName}:` })).toBeVisible()

  await page.getByRole('link', { name: 'Закрыть настройки сервера' }).click()
  await composer(page).fill(`Привет :${emojiName}:`)
  await composer(page).press('Enter')
  await expect(history(page).getByRole('img', { name: `:${emojiName}:` })).toBeVisible()
  await context.close()
})

test('a webhook posts into its channel by its secret address', async ({ browser, request }) => {
  const { context, page } = await ownerOnServer(browser, 'Вебхуки')

  const dialog = await openChannelSettings(page)
  await dialog.getByRole('tab', { name: 'Вебхуки' }).click()
  await dialog.getByLabel('Название вебхука', { exact: true }).fill('CI')
  await dialog.getByRole('button', { name: 'Создать вебхук' }).click()
  const address = dialog.getByLabel('Адрес вебхука', { exact: true })
  await expect(address).toHaveValue(/\/api\/v1\/webhooks\/\d+\/[\w-]+$/)
  const url = await address.inputValue()
  await page.keyboard.press('Escape')

  const sent = await request.post(url, { data: { content: 'Сборка зелёная ✅' } })
  expect(sent.status()).toBe(204)

  const message = history(page).getByRole('listitem').filter({ hasText: 'Сборка зелёная ✅' })
  await expect(message).toContainText('CI')
  await expect(message).toContainText('Вебхук')
  await context.close()
})

test('an announcement reaches the channel that follows it', async ({ browser }) => {
  const { context, page, serverName } = await ownerOnServer(browser, 'Новости')
  const readers = `Читатели ${Date.now().toString(36)}`

  const settings = await openChannelSettings(page)
  await settings.getByRole('checkbox', { name: /Канал объявлений/ }).check()
  await settings.getByRole('button', { name: 'Сохранить' }).click()
  await expect(settings).toBeHidden()

  // A second server of the same user follows the announcements.
  await createServerWithInvite(page, readers)
  await page.getByRole('link', { name: serverName }).click()
  await page.getByRole('button', { name: 'Подписаться на канал' }).click()
  const follow = page.getByRole('dialog', { name: 'Подписка на #общий' })
  await follow.getByLabel('Сервер', { exact: true }).selectOption({ label: readers })
  await follow.getByLabel('Канал', { exact: true }).selectOption({ label: '#общий' })
  await follow.getByRole('button', { name: 'Подписаться' }).click()
  await expect(follow).toContainText('Готово')
  await page.keyboard.press('Escape')

  await say(page, 'Вышла версия 1.0')
  const message = history(page).getByRole('listitem').filter({ hasText: 'Вышла версия 1.0' })
  await message.hover()
  await message.getByRole('button', { name: 'Опубликовать' }).click()
  await expect(message).toContainText('опубликовано')

  await page.getByRole('link', { name: readers }).click()
  const copy = history(page).getByRole('listitem').filter({ hasText: 'Вышла версия 1.0' })
  await expect(copy).toContainText(`${serverName} #общий`)
  await context.close()
})
