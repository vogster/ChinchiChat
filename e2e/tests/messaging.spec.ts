import { expect, test } from '@playwright/test'

import { registerAndOpenHome } from '../support/auth'
import { acceptInvite, createServerWithInvite } from '../support/guild'
import { newUser } from '../support/users'

import type { Browser, Page } from '@playwright/test'

const WIDE = { width: 1280, height: 800 }

const openAs = async (browser: Browser) => {
  const context = await browser.newContext({ viewport: WIDE })
  return { context, page: await context.newPage() }
}

const composer = (page: Page, channel = 'общий') =>
  page.getByRole('textbox', { name: `Сообщение в #${channel}` })
const history = (page: Page, channel = 'общий') =>
  page.getByRole('list', { name: `Сообщения в #${channel}` })

test('two people chat in real time', async ({ browser }) => {
  const owner = await openAs(browser)
  const friend = await openAs(browser)
  const ownerUser = newUser()
  const friendUser = newUser()
  const serverName = `Чат ${ownerUser.username}`

  await registerAndOpenHome(owner.page, ownerUser)
  const invite = await createServerWithInvite(owner.page, serverName)
  await registerAndOpenHome(friend.page, friendUser)
  await acceptInvite(friend.page, invite)

  // Both see each other online.
  await expect(owner.page.getByRole('complementary', { name: 'Участники — 2' })).toContainText(
    'В сети — 2',
  )

  // Owner writes; the friend sees it without reloading.
  await composer(owner.page).fill('Привет! Добро пожаловать 👋')
  await composer(owner.page).press('Enter')
  await expect(history(friend.page)).toContainText('Привет! Добро пожаловать 👋')

  // The friend starts typing; the owner sees the indicator.
  await composer(friend.page).pressSequentially('Спасибо')
  await expect(owner.page.getByText(`${friendUser.username} печатает…`)).toBeVisible()
  await composer(friend.page).press('Enter')
  await expect(history(owner.page)).toContainText('Спасибо')
  await expect(owner.page.getByText(`${friendUser.username} печатает…`)).toHaveCount(0)

  // The friend fixes their message with the up arrow; the owner sees the edit.
  await composer(friend.page).press('ArrowUp')
  const editBox = friend.page.getByRole('textbox', { name: 'Изменить сообщение' })
  await editBox.fill('Спасибо большое!')
  await editBox.press('Enter')
  await expect(history(owner.page)).toContainText('Спасибо большое!')
  await expect(history(owner.page)).toContainText('(изменено)')

  // The owner moderates the friend's message; it disappears for both.
  const message = history(owner.page).getByRole('listitem').filter({ hasText: 'Спасибо большое!' })
  await message.hover()
  await owner.page.keyboard.down('Shift')
  await message.getByRole('button', { name: 'Удалить' }).click()
  await owner.page.keyboard.up('Shift')
  await expect(history(friend.page)).not.toContainText('Спасибо большое!')
  await expect(history(owner.page)).not.toContainText('Спасибо большое!')

  // History survives a reload.
  await friend.page.reload()
  await expect(history(friend.page)).toContainText('Привет! Добро пожаловать 👋')

  await owner.context.close()
  await friend.context.close()
})

test('unread messages are highlighted until the channel is opened', async ({ browser }) => {
  const owner = await openAs(browser)
  const friend = await openAs(browser)
  const ownerUser = newUser()
  const serverName = `Непрочитанное ${ownerUser.username}`

  await registerAndOpenHome(owner.page, ownerUser)
  const invite = await createServerWithInvite(owner.page, serverName)
  await owner.page
    .getByRole('button', { name: 'Создать канал в категории Текстовые каналы' })
    .click()
  const dialog = owner.page.getByRole('dialog', { name: 'Создать канал' })
  await dialog.getByLabel('Название канала').fill('новости')
  await dialog.getByRole('button', { name: 'Создать' }).click()
  await expect(owner.page.getByRole('heading', { name: 'новости', level: 1 })).toBeVisible()

  await registerAndOpenHome(friend.page, newUser())
  await acceptInvite(friend.page, invite)

  await composer(owner.page, 'новости').fill('Важная новость')
  await composer(owner.page, 'новости').press('Enter')

  const channels = friend.page.getByRole('navigation', { name: 'Каналы' })
  const unreadLink = channels.getByRole('link', { name: 'новости (есть непрочитанные)' })
  await expect(unreadLink).toBeVisible()

  await unreadLink.click()
  await expect(history(friend.page, 'новости')).toContainText('Важная новость')
  await friend.page.getByRole('link', { name: 'общий' }).click()
  await expect(channels.getByRole('link', { name: 'новости', exact: true })).toBeVisible()

  await owner.context.close()
  await friend.context.close()
})
