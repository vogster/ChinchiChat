import { expect, test } from '@playwright/test'

import { registerAndOpenHome } from '../support/auth'
import { acceptInvite, createServerWithInvite } from '../support/guild'
import { newUser } from '../support/users'

test('a private channel appears for a member once they get the role', async ({ browser }) => {
  const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const memberContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const member = await memberContext.newPage()
  const ownerUser = newUser()
  const memberUser = newUser()
  const serverName = `Роли ${ownerUser.username}`

  await registerAndOpenHome(owner, ownerUser)
  const inviteUrl = await createServerWithInvite(owner, serverName)
  await registerAndOpenHome(member, memberUser)
  await acceptInvite(member, inviteUrl)

  // Owner creates a role.
  await owner.getByRole('button', { name: `Меню сервера ${serverName}` }).click()
  await owner.getByRole('menuitem', { name: 'Настройки сервера' }).click()
  await owner.getByRole('link', { name: 'Роли', exact: true }).click()
  await owner.getByRole('button', { name: 'Создать роль' }).click()
  const editor = owner.getByRole('form', { name: 'Редактировать роль new role' })
  await editor.getByLabel('Название роли').fill('Штаб')
  await editor.getByRole('button', { name: '#e74c3c' }).click()
  await editor.getByRole('button', { name: 'Сохранить изменения' }).click()
  await expect(owner.getByText('Изменения сохранены')).toBeVisible()
  await owner.getByRole('link', { name: 'Закрыть настройки сервера' }).click()

  // Owner creates a channel and hides it from everyone except that role.
  await owner.getByRole('button', { name: 'Создать канал в категории Текстовые каналы' }).click()
  const create = owner.getByRole('dialog', { name: 'Создать канал' })
  await create.getByLabel('Название канала').fill('штаб')
  await create.getByRole('button', { name: 'Создать' }).click()
  await expect(owner.getByRole('heading', { name: 'штаб', level: 1 })).toBeVisible()
  await expect(member.getByRole('link', { name: 'штаб' })).toBeVisible()

  await owner.getByRole('button', { name: 'Настроить канал штаб' }).click()
  const settings = owner.getByRole('dialog', { name: 'Настройки канала' })
  await settings.getByRole('tab', { name: 'Права доступа' }).click()
  const everyone = settings.getByRole('form', { name: '@everyone' })
  await everyone
    .getByRole('radiogroup', { name: 'Просматривать каналы' })
    .getByRole('radio', { name: 'Запретить' })
    .click()
  await everyone.getByRole('button', { name: 'Сохранить права' }).click()
  await expect(settings.getByText('Права сохранены')).toBeVisible()
  // The member loses the channel in real time.
  await expect(member.getByRole('link', { name: 'штаб' })).toHaveCount(0)

  await settings
    .getByRole('combobox', { name: 'Добавить роль или участника' })
    .selectOption({ label: 'Штаб' })
  const staff = settings.getByRole('form', { name: 'Штаб' })
  await staff
    .getByRole('radiogroup', { name: 'Просматривать каналы' })
    .getByRole('radio', { name: 'Разрешить' })
    .click()
  await staff.getByRole('button', { name: 'Сохранить права' }).click()
  await expect(settings.getByText('Права сохранены')).toBeVisible()
  await owner.keyboard.press('Escape')
  await owner.getByRole('textbox', { name: 'Сообщение в #штаб' }).fill('Совещание в 10')
  await owner.keyboard.press('Enter')

  // Giving the member the role reveals the channel, with its history.
  await owner.getByRole('button', { name: `Меню сервера ${serverName}` }).click()
  await owner.getByRole('menuitem', { name: 'Настройки сервера' }).click()
  await owner.getByRole('link', { name: 'Участники' }).click()
  await owner
    .getByRole('combobox', { name: `Добавить роль участнику ${memberUser.username}` })
    .selectOption({ label: 'Штаб' })
  await expect(
    owner.getByRole('list', { name: `Роли участника ${memberUser.username}` }),
  ).toContainText('Штаб')

  await member.getByRole('link', { name: 'штаб' }).click()
  await expect(member.getByText('Совещание в 10')).toBeVisible()

  await ownerContext.close()
  await memberContext.close()
})
