import { describe, expect, it } from 'vitest'

import { createE2eeClient } from './client'
import { createFakeDelivery } from './fake-delivery'
import { createMemoryStore } from './store'

import type { E2eeClient } from './client'

const ALICE = '1'
const BOB = '2'
const DM = { id: '500', memberIds: [ALICE, BOB] }

const setup = () => {
  const delivery = createFakeDelivery()
  const client = (userId: string, name: string) =>
    createE2eeClient({
      api: delivery.apiFor(userId),
      store: createMemoryStore(),
      userId,
      deviceName: name,
    })
  /** Hands every approval change to the clients, as the gateway would, until things settle. */
  const pump = async (...clients: E2eeClient[]) => {
    let handled = 0
    while (handled < delivery.approvalEvents.length) {
      const event = delivery.approvalEvents[handled] as (typeof delivery.approvalEvents)[number]
      handled += 1
      for (const c of clients) await c.approvals.handle(event)
    }
  }
  /** The person picks this device to compare emoji on. */
  const compareOn = async (approver: E2eeClient, ...clients: E2eeClient[]) => {
    await approver.approvals.compareHere(approver.approvals.views()[0]?.approvalId as string)
    await pump(approver, ...clients)
  }
  return { delivery, client, pump, compareOn }
}

describe('approving a new device from an old one', () => {
  it('shows the same emoji on both, then the new one is vouched for and reads old messages', async () => {
    const { delivery, client, pump, compareOn } = setup()
    const laptop = client(ALICE, 'Ноутбук')
    const bob = client(BOB, 'Браузер')
    await bob.ready()
    await laptop.open(DM)
    const old = await laptop.send(DM, 'До нового телефона')
    await laptop.flushBackup()
    const phone = client(ALICE, 'Телефон')
    const phoneId = await phone.ready()

    await phone.approvals.request()
    await pump(laptop, phone)
    // Nothing is sent until the person picks the laptop to compare on.
    expect(laptop.approvals.views()[0]).toMatchObject({ state: 'asked', deviceName: 'Телефон' })
    expect(phone.approvals.views()[0]).toMatchObject({ state: 'waiting' })
    await compareOn(laptop, phone)

    const [onLaptop] = laptop.approvals.views()
    const [onPhone] = phone.approvals.views()
    expect(onLaptop).toMatchObject({ role: 'approver', deviceName: 'Телефон', state: 'compare' })
    expect(onPhone).toMatchObject({ role: 'new', state: 'compare' })
    expect(onLaptop?.emoji).toHaveLength(6)
    expect(onLaptop?.emoji).toEqual(onPhone?.emoji)

    await laptop.approvals.confirm(onLaptop?.approvalId as string)
    await pump(laptop, phone)

    // The laptop said yes; the phone takes nothing until its own person says so too.
    expect(phone.approvals.views()[0]).toMatchObject({ state: 'compare', approvedThere: true })
    expect(await phone.recovery.key()).toBeNull()
    expect(delivery.devices.find((d) => d.id === phoneId)?.userSignature).toBeNull()

    await phone.approvals.confirm(onPhone?.approvalId as string)

    expect(phone.approvals.views()[0]?.state).toBe('done')
    expect(delivery.devices.find((d) => d.id === phoneId)?.userSignature).toEqual(
      expect.any(String),
    )
    expect(await phone.recovery.key()).toBe(await laptop.recovery.key())
    expect(await phone.read(DM, old)).toMatchObject({ payload: { text: 'До нового телефона' } })
  })

  it('takes the keys at once when the new device said yes first', async () => {
    const { client, pump, compareOn } = setup()
    const laptop = client(ALICE, 'Ноутбук')
    await laptop.ready()
    const phone = client(ALICE, 'Телефон')
    await phone.ready()

    await phone.approvals.request()
    await pump(laptop, phone)
    await compareOn(laptop, phone)
    await phone.approvals.confirm(phone.approvals.views()[0]?.approvalId as string)
    expect(phone.approvals.views()[0]).toMatchObject({ state: 'compare', confirmedHere: true })
    await laptop.approvals.confirm(laptop.approvals.views()[0]?.approvalId as string)
    await pump(laptop, phone)

    expect(phone.approvals.views()[0]?.state).toBe('done')
    expect(await phone.recovery.key()).toBe(await laptop.recovery.key())
  })

  it('takes nothing when the new device says the emoji differ, whatever came from the other', async () => {
    const { delivery, client, pump, compareOn } = setup()
    const laptop = client(ALICE, 'Ноутбук')
    await laptop.ready()
    const phone = client(ALICE, 'Телефон')
    const phoneId = await phone.ready()

    await phone.approvals.request()
    await pump(laptop, phone)
    await compareOn(laptop, phone)
    // Whoever answered (the server posing as an approved device, say) handed over keys.
    await laptop.approvals.confirm(laptop.approvals.views()[0]?.approvalId as string)
    await pump(laptop, phone)
    await phone.approvals.decline(phone.approvals.views()[0]?.approvalId as string)
    await pump(laptop, phone)

    expect(phone.approvals.views()[0]?.state).toBe('declined')
    expect(await phone.recovery.key()).toBeNull()
    expect(delivery.devices.find((d) => d.id === phoneId)?.userSignature).toBeNull()
  })

  it('closes the question on the old device when the new one says no first', async () => {
    const { client, pump } = setup()
    const laptop = client(ALICE, 'Ноутбук')
    await laptop.ready()
    const phone = client(ALICE, 'Телефон')
    await phone.ready()

    await phone.approvals.request()
    await pump(laptop, phone)
    await phone.approvals.decline(phone.approvals.views()[0]?.approvalId as string)
    await pump(laptop, phone)

    expect(laptop.approvals.views()).toEqual([])
    expect(phone.approvals.views()[0]?.state).toBe('declined')
  })

  it('asks on every approved device; the one picked answers, the others close', async () => {
    const { delivery, client, pump, compareOn } = setup()
    const laptop = client(ALICE, 'Ноутбук')
    await laptop.ready()
    const tablet = client(ALICE, 'Планшет')
    expect(await tablet.recovery.useKey((await laptop.recovery.key()) as string)).toBe('ok')
    const phone = client(ALICE, 'Телефон')
    await phone.ready()

    await phone.approvals.request()
    await pump(laptop, tablet, phone)
    expect(laptop.approvals.views()[0]?.state).toBe('asked')
    expect(tablet.approvals.views()[0]?.state).toBe('asked')
    // Neither answered by itself: the request is still waiting for someone to pick a device.
    expect(delivery.approvalEvents.at(-1)?.state).toBe('requested')

    await compareOn(tablet, laptop, phone)

    expect(tablet.approvals.views()[0]?.state).toBe('compare')
    expect(laptop.approvals.views()).toEqual([])
    expect(phone.approvals.views()[0]?.emoji).toEqual(tablet.approvals.views()[0]?.emoji)
  })

  it('says so when another device was picked at the same moment', async () => {
    const { client, pump } = setup()
    const laptop = client(ALICE, 'Ноутбук')
    await laptop.ready()
    const tablet = client(ALICE, 'Планшет')
    expect(await tablet.recovery.useKey((await laptop.recovery.key()) as string)).toBe('ok')
    const phone = client(ALICE, 'Телефон')
    await phone.ready()
    await phone.approvals.request()
    await pump(laptop, tablet, phone)

    // Both pressed before either heard of the other: the server lets the first one answer.
    const id = laptop.approvals.views()[0]?.approvalId as string
    await laptop.approvals.compareHere(id)
    await tablet.approvals.compareHere(id)
    await pump(laptop, tablet, phone)

    expect(laptop.approvals.views()[0]?.state).toBe('compare')
    expect(tablet.approvals.views()[0]?.state).toBe('elsewhere')
  })

  it('steps back when told another device answered after it was picked', async () => {
    const { delivery, client, pump, compareOn } = setup()
    const laptop = client(ALICE, 'Ноутбук')
    await laptop.ready()
    const phone = client(ALICE, 'Телефон')
    await phone.ready()
    await phone.approvals.request()
    await pump(laptop, phone)
    await compareOn(laptop, phone)

    // A relay that says another device answered: the emoji here are not the ones to compare.
    const last = delivery.approvalEvents.at(-1) as (typeof delivery.approvalEvents)[number]
    await laptop.approvals.handle({ ...last, approverDeviceId: '999' })
    expect(laptop.approvals.views()[0]?.state).toBe('elsewhere')
  })

  it('closes the question in another tab of the device picked to compare on', async () => {
    const { delivery, pump, compareOn } = setup()
    // Two tabs of one browser: one device, one store.
    const store = createMemoryStore()
    const tab = () =>
      createE2eeClient({ api: delivery.apiFor(ALICE), store, userId: ALICE, deviceName: 'Ноутбук' })
    const tab1 = tab()
    await tab1.ready()
    const tab2 = tab()
    await tab2.ready()
    const phone = createE2eeClient({
      api: delivery.apiFor(ALICE),
      store: createMemoryStore(),
      userId: ALICE,
      deviceName: 'Телефон',
    })
    await phone.ready()

    await phone.approvals.request()
    await pump(tab1, tab2, phone)
    expect(tab2.approvals.views()[0]?.state).toBe('asked')
    await compareOn(tab1, tab2, phone)
    expect(tab1.approvals.views()[0]?.state).toBe('compare')
    expect(tab2.approvals.views()).toEqual([])
  })

  it('lets the new device stop asking: the old devices close the question', async () => {
    const { delivery, client, pump } = setup()
    const laptop = client(ALICE, 'Ноутбук')
    await laptop.ready()
    const phone = client(ALICE, 'Телефон')
    await phone.ready()

    await phone.approvals.request()
    await pump(laptop, phone)
    // Nobody picked a device to compare on (the window was closed everywhere, say).
    await phone.approvals.cancel(phone.approvals.views()[0]?.approvalId as string)
    await pump(laptop, phone)

    expect(phone.approvals.views()).toEqual([])
    expect(laptop.approvals.views()).toEqual([])
    expect(delivery.approvalEvents.at(-1)?.state).toBe('declined')
  })

  it('stops when the old device says no', async () => {
    const { delivery, client, pump } = setup()
    const laptop = client(ALICE, 'Ноутбук')
    await laptop.ready()
    const phone = client(ALICE, 'Телефон')
    const phoneId = await phone.ready()

    await phone.approvals.request()
    await pump(laptop, phone)
    // "No, it wasn't me" right away, without comparing.
    await laptop.approvals.decline(laptop.approvals.views()[0]?.approvalId as string)
    await pump(laptop, phone)

    expect(phone.approvals.views()[0]?.state).toBe('declined')
    expect(delivery.devices.find((d) => d.id === phoneId)?.userSignature).toBeNull()
    expect(await phone.recovery.key()).toBeNull()
  })

  it('is not offered by a device that cannot vouch for anyone', async () => {
    const { client, pump } = setup()
    await client(ALICE, 'Ноутбук').ready()
    const phone = client(ALICE, 'Телефон')
    const tablet = client(ALICE, 'Планшет')
    await Promise.all([phone.ready(), tablet.ready()])

    await phone.approvals.request()
    await pump(phone, tablet)

    // The tablet is unapproved too: it holds no keys to hand over, so it shows nothing.
    expect(tablet.approvals.views()).toEqual([])
  })
})
