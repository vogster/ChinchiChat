// Takes the README screenshots from a local demo (see scripts/demo-data.mjs).
// Usage: node scripts/demo-screenshots.mjs <suffix>   (the suffix demo-data printed, e.g. ngg6)
// Writes docs/screenshots/*.png. Local development only.
// WIKI_OUT=<dir> also takes the wiki's extra screenshots there; ONLY_WIKI=1 skips the README ones.
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(new URL('../e2e/package.json', import.meta.url))
const { chromium } = require('@playwright/test')

const WEB = process.env.DEMO_WEB ?? 'http://localhost:5173'
const PASSWORD = 'demo-chinchi-2026'
const RUN = process.argv[2]
const OUT = new URL('../docs/screenshots/', import.meta.url)
if (!RUN) throw new Error('Pass the demo suffix, e.g. node scripts/demo-screenshots.mjs ngg6')

const contexts = []

/**
 * A signed-in browser of one demo person. Profiles persist between runs, so each person keeps one
 * encryption device (a new device would ask to be confirmed on the screenshots).
 */
const open = async (key, colorScheme = 'dark') => {
  const context = await chromium.launchPersistentContext(
    join(tmpdir(), 'chinchi-demo', RUN, `${key}-${colorScheme}`),
    {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      colorScheme,
      locale: 'ru-RU',
      permissions: ['camera', 'microphone'],
    },
  )
  contexts.push(context)
  const page = context.pages()[0] ?? (await context.newPage())
  await page.goto(`${WEB}/`)
  await page.waitForLoadState('networkidle')
  if (new URL(page.url()).pathname.startsWith('/login')) {
    await page.getByLabel('Имя пользователя или email', { exact: true }).fill(`${key}_${RUN}`)
    await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD)
    await page.keyboard.press('Enter')
    await page.waitForURL((url) => !url.pathname.startsWith('/login'))
  }
  return page
}

const shot = async (page, name, dir = fileURLToPath(OUT)) => {
  await page.mouse.move(0, 0)
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(dir, `${name}.png`) })
  process.stdout.write(join(dir, `${name}.png`) + '\n')
}

const server = (page) => page.getByRole('link', { name: /Кофе и код/ }).first()
const channel = (page, name) => page.getByRole('link', { name: new RegExp(`^${name}`) }).first()

await mkdir(OUT, { recursive: true })
const anna = await open('anna')

if (!process.env.ONLY_WIKI) {
  // 1. A busy text channel: replies, reactions, server emoji, a poll, roles in the member list.
  await server(anna).click()
  await channel(anna, 'общий').click()
  await anna.getByText('Куда идём в пятницу?').first().waitFor()
  // A single-choice poll votes on a click; once voted, the answer shows as a result instead.
  const vote = anna.getByRole('button', { name: 'Настолки', exact: true })
  if (await vote.isVisible()) await vote.click()
  const markRead = anna.getByRole('button', { name: 'Отметить прочитанным' })
  if (await markRead.isVisible()) await markRead.click()
  await shot(anna, 'chat')

  // 2. Code and a thread.
  await channel(anna, 'разработка').click()
  await anna.getByText('CREATE INDEX').first().waitFor()
  await shot(anna, 'code')

  // 3. A voice channel with three people.
  const boris = await open('boris')
  const vika = await open('vika')
  for (const page of [anna, boris, vika]) {
    await server(page).click()
    await page.getByRole('button', { name: 'Голосовой канал Общий' }).click()
    await page.getByText('В голосовом').waitFor({ timeout: 15_000 })
  }
  await anna.waitForTimeout(2500)
  await shot(anna, 'voice')
  for (const page of [anna, boris, vika]) {
    await page
      .getByRole('button', { name: /Отключиться/ })
      .first()
      .click()
  }

  // 4. An encrypted conversation (both devices online, so the keys can be exchanged).
  /** Puts off the recovery key prompt, which a device's first encrypted conversation brings up. */
  const later = (page, timeout = 5000) =>
    page
      .getByRole('button', { name: 'Позже' })
      .click({ timeout })
      .catch(() => undefined)
  await vika.goto(`${WEB}/`)
  const dm = await anna.evaluate(async (vikaName) => {
    const { data } = await (await fetch('/api/v1/users/@me/relationships')).json()
    const friend = data.relationships.find((r) => r.user.displayName === vikaName).user
    // Again on a rerun: the conversation from the last run, not a second one.
    const { data: mine } = await (await fetch('/api/v1/users/@me/channels')).json()
    const existing = mine.channels.find(
      (c) => c.encrypted && c.recipients.some((r) => r.id === friend.id),
    )
    if (existing) return existing.id
    const response = await fetch('/api/v1/users/@me/channels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recipientIds: [friend.id], encrypted: true }),
    })
    return (await response.json()).data.channel.id
  }, 'Вика')
  const write = async (page, text) => {
    await page.goto(`${WEB}/channels/@me/${dm}`)
    await later(page, 10_000)
    const box = page.getByRole('textbox', { name: /Написать/ })
    await box.waitFor({ timeout: 30_000 }).catch(async (error) => {
      await page.screenshot({ path: join(tmpdir(), 'chinchi-demo', 'failed.png') })
      throw error
    })
    // Again on a rerun: the message from the last run, not a second copy.
    await page.waitForTimeout(1500)
    if ((await page.getByText(text).count()) > 0) return
    await box.fill(text)
    await page.keyboard.press('Enter')
    await page.getByText(text).first().waitFor({ timeout: 15_000 })
  }
  /** Notices that are not what the picture is about: a device to confirm, a history hint. */
  const tidy = async (page) => {
    for (const name of ['Понятно', 'Скрыть подсказку']) {
      await page
        .getByRole('button', { name, exact: true })
        .click({ timeout: 2000 })
        .catch(() => undefined)
    }
  }
  await write(anna, 'Привет! Пароль от тестового стенда скину сюда, тут сквозное шифрование 🔒')
  await write(vika, 'Отлично, жду. Сервер этого всё равно не прочитает 😉')
  await anna.goto(`${WEB}/channels/@me/${dm}`)
  await later(anna)
  await anna.getByText('Сервер этого всё равно не прочитает').first().waitFor({ timeout: 30_000 })
  await tidy(anna)
  await shot(anna, 'encrypted')

  // 5. Server settings: roles.
  await server(anna).click()
  await anna
    .getByRole('button', { name: /Кофе и код/ })
    .first()
    .click()
  await anna.getByRole('menuitem', { name: /Настройки сервера/ }).click()
  await anna.getByRole('link', { name: 'Роли', exact: true }).click()
  await anna
    .getByRole('button', { name: /Разработчики/ })
    .first()
    .click()
  await anna.waitForTimeout(500)
  await shot(anna, 'roles')

  // 6. Light theme.
  const light = await open('anna', 'light')
  await server(light).click()
  await channel(light, 'общий').click()
  await light.getByText('Куда идём в пятницу?').first().waitFor()
  await shot(light, 'chat-light')
}

// Wiki: friends, notifications, settings, moderation, automod, audit log, instance admin.
const WIKI_OUT = process.env.WIKI_OUT
if (WIKI_OUT) {
  await mkdir(WIKI_OUT, { recursive: true })
  await anna.goto(`${WEB}/`)
  // Everyone, not only who is online: without --hold the demo people are offline.
  await anna.getByRole('tab', { name: 'Все' }).click()
  await anna.getByRole('button', { name: /Написать — Вика/ }).waitFor()
  await shot(anna, 'friends', WIKI_OUT)

  await server(anna).click()
  await channel(anna, 'общий').click()
  const guildId = new URL(anna.url()).pathname.split('/')[2]
  await anna.getByRole('button', { name: /Меню сервера/ }).click()
  await anna.getByRole('menuitem', { name: 'Уведомления' }).click()
  await anna.getByRole('dialog').waitFor()
  await shot(anna, 'notifications', WIKI_OUT)
  await anna.keyboard.press('Escape')

  const members = anna.getByRole('complementary', { name: /Участники/ })
  await members.getByRole('button', { name: /^Дима/ }).click()
  await anna.getByRole('dialog', { name: /Профиль: Дима/ }).waitFor()
  await shot(anna, 'moderation', WIKI_OUT)
  await anna.keyboard.press('Escape')

  await anna.goto(`${WEB}/server-settings/${guildId}/automod`)
  const words = anna.getByLabel('Запрещённые слова', { exact: true })
  await words.waitFor()
  await words.fill(['казино', 'купить подписчиков', 'спам-ссылка'].join('\n'))
  await shot(anna, 'automod', WIKI_OUT)

  await anna.goto(`${WEB}/server-settings/${guildId}/audit-log`)
  await anna
    .getByText(/создал\(а\) роль/)
    .first()
    .waitFor()
  await shot(anna, 'audit-log', WIKI_OUT)

  await anna.goto(`${WEB}/settings/profile`)
  await anna.getByLabel('Отображаемое имя', { exact: true }).waitFor()
  await shot(anna, 'settings-profile', WIKI_OUT)

  await anna.goto(`${WEB}/admin/users`)
  // Only this demo's people, not every account on the dev instance.
  await anna.getByPlaceholder('Имя или email').fill(RUN)
  await anna.waitForTimeout(1500)
  await shot(anna, 'admin', WIKI_OUT)
}

await Promise.all(contexts.map((context) => context.close()))
