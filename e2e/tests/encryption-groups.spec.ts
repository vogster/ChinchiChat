import { expect, test } from '@playwright/test'

import { registerAndOpenHome } from '../support/auth'
import { saveRecoveryKey } from '../support/encryption'
import { befriend } from '../support/friends'
import { newUser } from '../support/users'

import type { Browser, Page } from '@playwright/test'

const openAs = async (browser: Browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await context.addInitScript(() => localStorage.setItem('chinchi.e2ee.guideSeen', '1'))
  return { context, page: await context.newPage() }
}

const composer = (page: Page) => page.getByRole('textbox', { name: /^Написать/ })
const say = async (page: Page, text: string) => {
  await composer(page).fill(text)
  await composer(page).press('Enter')
}
const openGroup = async (page: Page) => {
  await page.goto('/')
  await page
    .getByRole('complementary', { name: 'Личные сообщения' })
    .getByRole('link', { name: /зашифрованная беседа/ })
    .click()
  await saveRecoveryKey(page)
}

test('a member takes in someone no device here added, and then they read along', async ({
  browser,
}) => {
  const [alice, bob, carol, dan] = await Promise.all([
    openAs(browser),
    openAs(browser),
    openAs(browser),
    openAs(browser),
  ])
  const [aliceUser, bobUser, carolUser, danUser] = [newUser(), newUser(), newUser(), newUser()]
  await registerAndOpenHome(alice.page, aliceUser)
  await registerAndOpenHome(bob.page, bobUser)
  await registerAndOpenHome(carol.page, carolUser)
  await registerAndOpenHome(dan.page, danUser)
  await befriend(alice.page, bob.page, aliceUser.username, bobUser.username)
  await befriend(alice.page, carol.page, aliceUser.username, carolUser.username)
  await befriend(alice.page, dan.page, aliceUser.username, danUser.username)

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
  await say(alice.page, 'Пока без Дэна')
  await openGroup(bob.page)
  await expect(bob.page.getByText('Пока без Дэна')).toBeVisible()

  // Dan is added past Alice's client, as if the device that invited him were gone since.
  const added = await alice.page.evaluate(
    async ({ id, userId }) => {
      const response = await fetch(`/api/v1/channels/${id}/recipients/${userId}`, {
        method: 'PUT',
      })
      return `${response.status} ${await response.text()}`
    },
    { id: channelId, userId: await dan.page.evaluate(myId) },
  )
  expect(added).toBe('204 ')
  await openGroup(dan.page)

  // Nobody takes Dan in by themselves: the server could have listed him.
  await bob.page.reload()
  const waiting = bob.page.getByRole('status', { name: 'Ещё не в зашифрованной беседе' })
  await expect(waiting).toContainText(danUser.username)
  await waiting.getByRole('button', { name: `Впустить в беседу: ${danUser.username}` }).click()
  await expect(waiting).toBeHidden()

  await say(bob.page, 'Дэн, теперь ты с нами')
  await expect(dan.page.getByText('Дэн, теперь ты с нами')).toBeVisible()
  await expect(alice.page.getByText('Дэн, теперь ты с нами')).toBeVisible()

  await Promise.all([alice, bob, carol, dan].map(({ context }) => context.close()))
})

const myId = async () => {
  const response = await fetch('/api/v1/users/@me')
  const { data } = (await response.json()) as { data: { user: { id: string } } }
  return data.user.id
}
