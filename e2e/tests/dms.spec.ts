import { expect, test } from '@playwright/test'

import { registerAndOpenHome } from '../support/auth'
import { befriend } from '../support/friends'
import { newUser } from '../support/users'

import type { Browser, Page } from '@playwright/test'

const WIDE = { width: 1280, height: 800 }

const openAs = async (browser: Browser) => {
  const context = await browser.newContext({ viewport: WIDE })
  return { context, page: await context.newPage() }
}

const tab = (page: Page, name: string) => page.getByRole('tab', { name })

test('two strangers become friends and talk in a DM', async ({ browser }) => {
  const alice = await openAs(browser)
  const bob = await openAs(browser)
  const aliceUser = newUser()
  const bobUser = newUser()

  await registerAndOpenHome(alice.page, aliceUser)
  await registerAndOpenHome(bob.page, bobUser)

  // Alice asks by username; Bob sees the request arrive and accepts it.
  await tab(alice.page, 'Добавить в друзья').click()
  await alice.page.getByLabel('Имя пользователя', { exact: true }).fill(bobUser.username)
  await alice.page.getByRole('button', { name: 'Отправить заявку' }).click()
  await expect(alice.page.getByText(`Заявка отправлена: ${bobUser.username}`)).toBeVisible()

  await tab(bob.page, 'Ожидание').click()
  await bob.page.getByRole('button', { name: `Принять — ${aliceUser.username}` }).click()

  // Friends see each other online without sharing a server.
  await tab(alice.page, 'В сети').click()
  const online = alice.page.getByRole('list', { name: 'В сети' })
  await expect(online).toContainText(bobUser.username)

  // Alice opens the DM and writes; Bob gets it in his sidebar, unread.
  await alice.page.getByRole('button', { name: `Написать — ${bobUser.username}` }).click()
  const aliceComposer = alice.page.getByRole('textbox', { name: `Написать @${bobUser.username}` })
  await aliceComposer.fill('Привет, Боб!')
  await aliceComposer.press('Enter')

  const dmLink = bob.page
    .getByRole('complementary', { name: 'Личные сообщения' })
    .getByRole('link', { name: new RegExp(`^${aliceUser.username} \\(есть непрочитанные`) })
  await dmLink.click()
  const bobHistory = bob.page.getByRole('list', { name: `Переписка с ${aliceUser.username}` })
  await expect(bobHistory).toContainText('Привет, Боб!')

  // Bob answers; Alice sees it live.
  const bobComposer = bob.page.getByRole('textbox', { name: `Написать @${aliceUser.username}` })
  await bobComposer.fill('Привет, Алиса!')
  await bobComposer.press('Enter')
  await expect(
    alice.page.getByRole('list', { name: `Переписка с ${bobUser.username}` }),
  ).toContainText('Привет, Алиса!')

  // Bob blocks Alice: her composer stays, but the server refuses the message.
  await bob.page.getByRole('link', { name: 'Друзья' }).click()
  await tab(bob.page, 'Все').click()
  await bob.page.getByRole('button', { name: `Ещё — ${aliceUser.username}` }).click()
  await bob.page.getByRole('menuitem', { name: 'Заблокировать' }).click()
  await tab(bob.page, 'Заблокированные').click()
  await expect(bob.page.getByRole('list', { name: 'Заблокированные' })).toContainText(
    aliceUser.username,
  )
  await aliceComposer.fill('Ты тут?')
  await aliceComposer.press('Enter')
  await expect(alice.page.getByText('Не удалось отправить')).toBeVisible()

  await alice.context.close()
  await bob.context.close()
})

test('search in a DM finds a message and jumps to it', async ({ browser }) => {
  const alice = await openAs(browser)
  const bob = await openAs(browser)
  const aliceUser = newUser()
  const bobUser = newUser()
  await registerAndOpenHome(alice.page, aliceUser)
  await registerAndOpenHome(bob.page, bobUser)
  await befriend(alice.page, bob.page, aliceUser.username, bobUser.username)

  await tab(alice.page, 'Все').click()
  await alice.page.getByRole('button', { name: `Написать — ${bobUser.username}` }).click()
  const composer = alice.page.getByRole('textbox', { name: `Написать @${bobUser.username}` })
  const history = alice.page.getByRole('list', { name: `Переписка с ${bobUser.username}` })
  for (const text of ['Пароль от вайфая на холодильнике', 'Что-то совсем другое']) {
    await composer.fill(text)
    await composer.press('Enter')
    await expect(history).toContainText(text)
  }

  const box = alice.page.getByRole('searchbox', { name: 'Поиск' })
  await box.fill('холодильник')
  await box.press('Enter')
  const results = alice.page.getByRole('complementary', { name: 'Результаты поиска' })
  await expect(results).toContainText('Найдено: 1')
  await expect(results).toContainText('Пароль от вайфая на холодильнике')
  await expect(results).not.toContainText('Что-то совсем другое')

  await results.getByRole('button', { name: 'Перейти' }).click()
  await expect(history.getByText('Пароль от вайфая на холодильнике')).toBeInViewport()

  await alice.context.close()
  await bob.context.close()
})
