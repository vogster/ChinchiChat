import { expect, test } from '@playwright/test'

import { registerAndOpenHome } from '../support/auth'
import { apiUrl, connectBot } from '../support/bot'
import { createServerWithInvite } from '../support/guild'
import { newUser } from '../support/users'

interface Interaction {
  readonly id: string
  readonly token: string
  readonly options: Record<string, string>
}

test('a bot joins a server, takes a slash command and answers it', async ({ browser, request }) => {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()
  const user = newUser()
  const serverName = `Боты ${user.username}`
  const botName = `dice_${Date.now().toString(36)}`
  await registerAndOpenHome(page, user)
  await createServerWithInvite(page, serverName)

  // The owner creates a bot; its token is shown once.
  await page.getByRole('link', { name: 'Настройки пользователя' }).click()
  await page.getByRole('link', { name: 'Боты', exact: true }).click()
  await page.getByLabel('Имя бота', { exact: true }).fill(botName)
  await page.getByRole('button', { name: 'Создать бота' }).click()
  const tokenField = page.getByLabel('Токен бота', { exact: true })
  await expect(tokenField).toHaveValue(/^[\w-]{43}$/)
  const token = await tokenField.inputValue()
  await page
    .getByLabel(`Добавить ${botName} на сервер`, { exact: true })
    .selectOption({ label: serverName })
  await expect(page.getByText('Бот добавлен на сервер')).toBeVisible()

  // The bot program: online on the gateway, with one command registered.
  const bot = await connectBot(token)
  const auth = { authorization: `Bearer ${token}` }
  const registered = await request.put(apiUrl('/bots/@me/commands'), {
    headers: auth,
    data: [
      {
        name: 'roll',
        description: 'Бросить кубик',
        options: [{ name: 'sides', description: 'Граней', required: true }],
      },
    ],
  })
  expect(registered.status()).toBe(200)

  await page.getByRole('link', { name: 'Закрыть настройки' }).click()
  await page.getByRole('link', { name: serverName }).click()
  const composer = page.getByRole('textbox', { name: 'Сообщение в #общий' })
  await composer.fill('/ro')
  await page.getByRole('option', { name: /\/roll/ }).click()
  await composer.pressSequentially('20')
  await composer.press('Enter')

  const interaction = (await bot.next('INTERACTION_CREATE')) as Interaction
  expect(interaction.options).toEqual({ sides: '20' })
  const answered = await request.post(
    apiUrl(`/interactions/${interaction.id}/${interaction.token}/callback`),
    { data: { content: 'Выпало 17 🎲' } },
  )
  expect(answered.status()).toBe(201)
  bot.close()

  const answer = page
    .getByRole('list', { name: 'Сообщения в #общий' })
    .getByRole('listitem')
    .filter({ hasText: 'Выпало 17 🎲' })
  await expect(answer).toContainText(botName)
  await expect(answer).toContainText('Бот')
  await expect(answer).toContainText(`${user.username} использует /roll`)
  await context.close()
})
