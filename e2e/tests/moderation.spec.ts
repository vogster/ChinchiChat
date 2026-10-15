import { expect, test } from '@playwright/test'

import { registerAndOpenHome } from '../support/auth'
import { acceptInvite, createServerWithInvite } from '../support/guild'
import { newUser } from '../support/users'

import type { Browser, Page } from '@playwright/test'

/** An owner and a member on a fresh server, each in their own browser. */
const serverWithMember = async (browser: Browser) => {
  const ownerPage = await (
    await browser.newContext({ viewport: { width: 1400, height: 900 } })
  ).newPage()
  const memberPage = await (
    await browser.newContext({ viewport: { width: 1400, height: 900 } })
  ).newPage()
  const owner = newUser()
  const member = newUser()
  const serverName = `Модерация ${owner.username}`
  await registerAndOpenHome(ownerPage, owner)
  const invite = await createServerWithInvite(ownerPage, serverName)
  await registerAndOpenHome(memberPage, member)
  await acceptInvite(memberPage, invite)
  return { ownerPage, memberPage, owner, member, serverName }
}

const openCard = async (page: Page, username: string) => {
  const members = page.getByRole('complementary', { name: /Участники/ })
  // Wait for the newcomer's presence so their row has settled in the "online" group.
  const row = members.getByRole('button', { name: new RegExp(`^${username}, В сети`) })
  await row.click()
  const card = page.getByRole('dialog', { name: `Профиль: ${username}` })
  await expect(card).toBeVisible()
  return card
}

const openServerSettings = async (page: Page, serverName: string, section: string) => {
  await page.getByRole('button', { name: `Меню сервера ${serverName}` }).click()
  await page.getByRole('menuitem', { name: 'Настройки сервера' }).click()
  await page.getByRole('link', { name: section }).click()
}

test('a timeout silences a member until it is lifted', async ({ browser }) => {
  const { ownerPage, memberPage, member } = await serverWithMember(browser)

  const card = await openCard(ownerPage, member.username)
  await card.getByRole('button', { name: 'Тайм-аут' }).click()
  const dialog = ownerPage.getByRole('dialog', { name: `Тайм-аут: ${member.username}` })
  await dialog.getByRole('radio', { name: '10 минут' }).check()
  await dialog.getByLabel('Причина', { exact: true }).fill('остынь')
  await dialog.getByRole('button', { name: 'Отправить в тайм-аут' }).click()

  await expect(memberPage.getByText(/Вы в тайм-ауте до/)).toBeVisible()
  await expect(memberPage.getByRole('textbox', { name: 'Сообщение в #общий' })).toHaveCount(0)

  const again = await openCard(ownerPage, member.username)
  await again.getByRole('button', { name: 'Снять тайм-аут' }).click()
  await expect(memberPage.getByRole('textbox', { name: 'Сообщение в #общий' })).toBeVisible()
})

test('a ban removes the member and keeps them out until unbanned', async ({ browser }) => {
  const { ownerPage, memberPage, member, serverName } = await serverWithMember(browser)

  const card = await openCard(ownerPage, member.username)
  await card.getByRole('button', { name: 'Забанить' }).click()
  const dialog = ownerPage.getByRole('dialog', { name: `Забанить: ${member.username}` })
  await dialog.getByLabel('Причина', { exact: true }).fill('спам')
  await dialog.getByRole('button', { name: 'Забанить' }).click()

  await expect(memberPage.getByRole('link', { name: serverName })).toHaveCount(0)

  await openServerSettings(ownerPage, serverName, 'Баны')
  await expect(ownerPage.getByText('спам')).toBeVisible()
  await ownerPage.getByRole('button', { name: `Разбанить — ${member.username}` }).click()
  await expect(ownerPage.getByText('Никто не забанен')).toBeVisible()

  // Still in the server settings: the journal is next door.
  await ownerPage.getByRole('link', { name: 'Журнал действий', exact: true }).click()
  const log = ownerPage.getByRole('list', { name: 'Журнал действий' })
  await expect(log).toContainText(`забанил(а) ${member.username}`)
})

test('a reported message reaches the moderators, who delete it', async ({ browser }) => {
  const { ownerPage, memberPage, serverName } = await serverWithMember(browser)

  await memberPage.getByRole('textbox', { name: 'Сообщение в #общий' }).fill('купи казино')
  await memberPage.keyboard.press('Enter')
  const message = ownerPage.getByRole('listitem').filter({ hasText: 'купи казино' })
  await message.hover()
  await message.getByRole('button', { name: 'Пожаловаться' }).click()
  const dialog = ownerPage.getByRole('dialog', { name: 'Пожаловаться на сообщение' })
  await dialog.getByRole('radio', { name: 'Спам или реклама' }).check()
  await dialog.getByRole('button', { name: 'Отправить' }).click()
  await expect(dialog.getByText(/Жалоба отправлена/)).toBeVisible()
  await ownerPage.keyboard.press('Escape')

  await openServerSettings(ownerPage, serverName, 'Жалобы')
  const reports = ownerPage.getByRole('list', { name: 'Жалобы' })
  await expect(reports).toContainText('купи казино')
  await reports.getByRole('button', { name: 'Удалить сообщение' }).click()
  await expect(ownerPage.getByText('Открытых жалоб нет')).toBeVisible()
  await expect(memberPage.getByText('купи казино')).toHaveCount(0)
})

test('automod refuses blocked words', async ({ browser }) => {
  const { ownerPage, memberPage, serverName } = await serverWithMember(browser)

  await openServerSettings(ownerPage, serverName, 'Автомодерация')
  await ownerPage.getByLabel('Запрещённые слова', { exact: true }).fill('казино')
  await ownerPage.getByRole('button', { name: 'Сохранить' }).click()
  await expect(ownerPage.getByText('Сохранено')).toBeVisible()

  await memberPage.getByRole('textbox', { name: 'Сообщение в #общий' }).fill('лучшее казино')
  await memberPage.keyboard.press('Enter')
  await expect(memberPage.getByText('Не удалось отправить.')).toBeVisible()
})
