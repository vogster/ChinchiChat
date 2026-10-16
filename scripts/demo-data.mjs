// Fills a local dev stack with a lively demo server for screenshots (README, wiki).
// Usage: pnpm dev:up && pnpm dev, then `node scripts/demo-data.mjs [--hold]`.
// --hold keeps everyone online (gateway connections) until Ctrl+C;
// --online=<suffix> only brings an earlier demo's people online (sign-ups are rate limited).
// Local development only: the accounts and password below are throwaway demo values.
import { createRequire } from 'node:module'

const require = createRequire(new URL('../apps/server/package.json', import.meta.url))
const sharp = require('sharp')
const { WebSocket } = require('ws')

const API = process.env.DEMO_API ?? 'http://localhost:3000/api/v1'
const MAILPIT = process.env.DEMO_MAILPIT ?? 'http://localhost:8025/api/v1'
const PASSWORD = 'demo-chinchi-2026'
const HOLD = process.argv.includes('--hold')
const ONLINE = process.argv.find((arg) => arg.startsWith('--online='))?.slice('--online='.length)
const RUN = ONLINE ?? Date.now().toString(36).slice(-4)

const PEOPLE = [
  { key: 'anna', name: 'Анна', color: '#5865f2', bio: 'Делаю этот сервер уютным ☕' },
  { key: 'boris', name: 'Борис', color: '#eb459e', bio: 'Бэкенд, Postgres и велосипед' },
  { key: 'vika', name: 'Вика', color: '#57f287', bio: 'Дизайн и иллюстрации' },
  { key: 'dima', name: 'Дима', color: '#fee75c', bio: 'Фронтенд, React' },
  { key: 'lena', name: 'Лена', color: '#ed4245', bio: 'Тестирую всё, что движется' },
  { key: 'kirill', name: 'Кирилл', color: '#00a8fc', bio: 'DevOps: docker compose up' },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** One call; waits out rate limits instead of failing. */
const call = async (token, method, path, body) => {
  for (;;) {
    const isFile = body instanceof Uint8Array
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        'x-auth-mode': 'bearer',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined
          ? {}
          : { 'content-type': isFile ? 'image/png' : 'application/json' }),
      },
      body: body === undefined ? undefined : isFile ? body : JSON.stringify(body),
    })
    if (response.status === 429) {
      await sleep(Number(response.headers.get('retry-after') ?? 2) * 1000 + 200)
      continue
    }
    if (response.status === 204) return null
    const json = await response.json()
    if (!json.success) throw new Error(`${method} ${path}: ${json.code} ${json.error}`)
    return json.data
  }
}

/** A round picture with the person's initial (or the server's). */
const picture = async (letter, color, size = 256) =>
  new Uint8Array(
    await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
          `<rect width="100%" height="100%" fill="${color}"/>` +
          `<text x="50%" y="54%" font-family="Segoe UI, Arial, sans-serif" font-size="${size * 0.5}" ` +
          `font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="middle">${letter}</text></svg>`,
      ),
    )
      .png()
      .toBuffer(),
  )

/** Small emoji pictures drawn as SVG, so the demo needs no image files. */
const emojiPicture = async (svg) =>
  new Uint8Array(
    await sharp(
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">${svg}</svg>`),
    )
      .png()
      .toBuffer(),
  )

const verifyEmail = async (email) => {
  for (let attempt = 0; attempt < 30; attempt++) {
    const query = encodeURIComponent(`to:"${email}"`)
    const { messages } = await (await fetch(`${MAILPIT}/search?query=${query}`)).json()
    if (messages.length > 0) {
      const { Text } = await (await fetch(`${MAILPIT}/message/${messages[0].ID}`)).json()
      const token = /verify-email\?token=([A-Za-z0-9_-]+)/.exec(Text)?.[1]
      if (token) return call(null, 'POST', '/auth/verify-email', { token })
    }
    await sleep(500)
  }
  throw new Error(`No verification email for ${email}`)
}

const signUp = async ({ key, name, color, bio }) => {
  const username = `${key}_${RUN}`
  const email = `${username}@demo.chinchi.test`
  const { token, user } = await call(null, 'POST', '/auth/register', {
    username,
    email,
    password: PASSWORD,
  })
  await verifyEmail(email)
  await call(token, 'PATCH', '/users/@me', { displayName: name, bio })
  await call(token, 'PUT', '/users/@me/avatar', await picture(name[0], color))
  return { key, name, token, id: user.id, username }
}

const say = (person, channelId, content, extra = {}) =>
  call(person.token, 'POST', `/channels/${channelId}/messages`, { content, ...extra }).then(
    (data) => data.message,
  )

const react = (person, channelId, messageId, emoji) =>
  call(
    person.token,
    'PUT',
    `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
  )

/** Keeps a person online until the process ends. */
const goOnline = (person, status = 'online') => {
  const socket = new WebSocket(API.replace(/^http/, 'ws') + '/gateway')
  socket.on('message', (raw) => {
    const frame = JSON.parse(raw.toString())
    if (frame.op === 10) {
      socket.send(JSON.stringify({ op: 2, d: { token: person.token } }))
      setInterval(
        () => socket.send(JSON.stringify({ op: 1, d: null })),
        frame.d.heartbeatInterval / 2,
      )
    }
    if (frame.t === 'READY' && status !== 'online') {
      socket.send(JSON.stringify({ op: 3, d: { status } }))
    }
  })
  return socket
}

const main = async () => {
  const people = {}
  for (const person of PEOPLE) people[person.key] = await signUp(person)
  const { anna, boris, vika, dima, lena, kirill } = people
  const everyone = Object.values(people)

  // Friends of Anna (the account the screenshots are taken from).
  for (const friend of [boris, vika, dima]) {
    await call(anna.token, 'POST', '/users/@me/relationships', { username: friend.username })
    await call(friend.token, 'PUT', `/users/@me/relationships/${anna.id}`, { type: 'friend' })
  }

  const { guild } = await call(anna.token, 'POST', '/guilds', { name: 'Кофе и код', locale: 'ru' })
  await call(anna.token, 'PUT', `/guilds/${guild.id}/icon`, await picture('☕', '#2b2d31'))
  const general = guild.channels.find((c) => c.type === 'text')
  const lounge = guild.channels.find((c) => c.type === 'voice')
  const textCategory = guild.channels.find((c) => c.type === 'category')?.id ?? null
  const channel = async (name, type, topic, parentId = textCategory) =>
    (
      await call(anna.token, 'POST', `/guilds/${guild.id}/channels`, {
        name,
        type,
        parentId,
        ...(topic ? { topic } : {}),
      })
    ).channel
  await call(anna.token, 'PATCH', `/channels/${general.id}`, {
    topic: 'Болтаем обо всём: работа, кофе, выходные',
  })
  const dev = await channel('разработка', 'text', 'Код, ревью и релизы')
  const design = await channel('дизайн', 'text', 'Макеты и иконки')
  const memes = await channel('мемы', 'text')
  const voiceCategory = guild.channels.filter((c) => c.type === 'category')[1]?.id ?? null
  await channel('Созвон по релизу', 'voice', undefined, voiceCategory)

  const { invite } = await call(anna.token, 'POST', `/channels/${general.id}/invites`, {})
  for (const person of everyone.slice(1)) {
    await call(person.token, 'POST', `/invites/${invite.code}`)
  }

  const role = async (name, color, permissions = '0') =>
    (
      await call(anna.token, 'POST', `/guilds/${guild.id}/roles`, {
        name,
        color,
        permissions,
        hoist: true,
        mentionable: true,
      })
    ).role
  const admins = await role('Админ', 0xed4245, (1n << 3n).toString())
  const devs = await role('Разработчики', 0x5865f2)
  const designers = await role('Дизайн', 0x57f287)
  const assign = (person, r) =>
    call(anna.token, 'PUT', `/guilds/${guild.id}/members/${person.id}/roles/${r.id}`)
  await assign(kirill, admins)
  for (const person of [boris, dima, kirill]) await assign(person, devs)
  await assign(vika, designers)

  const emoji = async (name, svg) =>
    (
      await fetch(`${API}/guilds/${guild.id}/emojis?name=${name}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${anna.token}`, 'content-type': 'image/png' },
        body: await emojiPicture(svg),
      }).then((r) => r.json())
    ).data.emoji
  const ship = await emoji(
    'shipit',
    '<circle cx="64" cy="64" r="60" fill="#5865f2"/><path d="M34 70 L64 30 L94 70 Z" fill="#fff"/><rect x="54" y="70" width="20" height="28" fill="#fff"/>',
  )
  const coffee = await emoji(
    'coffee_time',
    '<rect x="24" y="44" width="64" height="60" rx="12" fill="#c58b5a"/><path d="M88 58 h10 a12 12 0 0 1 0 24 h-10" stroke="#c58b5a" stroke-width="8" fill="none"/><path d="M44 18 q8 10 0 20 M64 18 q8 10 0 20" stroke="#999" stroke-width="5" fill="none"/>',
  )
  const shipText = `<:${ship.name}:${ship.id}>`
  const coffeeText = `<:${coffee.name}:${coffee.id}>`

  // #общий: a friendly morning.
  const hello = await say(anna, general.id, `Доброе утро, команда! ${coffeeText}`)
  await react(boris, general.id, hello.id, '👋')
  await react(vika, general.id, hello.id, '👋')
  await react(dima, general.id, hello.id, coffeeText)
  await say(boris, general.id, 'Утро! Кто сегодня на созвоне в 12:00?')
  await say(vika, general.id, 'Я буду, принесу новые макеты **главной страницы** 🎨')
  const release = await say(
    kirill,
    general.id,
    `Новая версия уже на сервере, обновил за пару минут ${shipText}\n> docker compose pull && docker compose up -d`,
  )
  await react(anna, general.id, release.id, '🚀')
  await react(boris, general.id, release.id, '🚀')
  await react(lena, general.id, release.id, '🚀')
  await react(dima, general.id, release.id, shipText)
  await say(
    lena,
    general.id,
    `<@${kirill.id}> супер! Прогнала основные сценарии — всё зелёное ✅`,
    {
      replyTo: release.id,
    },
  )
  await say(anna, general.id, 'Куда идём в пятницу после работы?', {
    poll: {
      question: 'Куда идём в пятницу?',
      answers: ['Пиццерия за углом', 'Настолки', 'Кино', 'Остаёмся кодить 😅'],
      multiple: false,
      durationHours: 72,
    },
  }).then(async (message) => {
    const answers = message.poll.answers
    const vote = (person, index) =>
      call(person.token, 'PUT', `/channels/${general.id}/polls/${message.id}/answers/@me`, {
        answerIds: [answers[index].id],
      })
    await vote(boris, 1)
    await vote(vika, 1)
    await vote(dima, 0)
    await vote(lena, 1)
    await vote(kirill, 3)
  })
  await say(dima, general.id, 'Настолки 🎲 однозначно')

  // #разработка: code and a thread.
  await say(boris, dev.id, 'Поймал медленный запрос в ленте сообщений, вот план:')
  const code = await say(
    boris,
    dev.id,
    '```sql\nCREATE INDEX CONCURRENTLY messages_channel_id_idx\n  ON messages (channel_id, id DESC);\n```\nНа проде 120 мс → 3 мс.',
  )
  await react(dima, dev.id, code.id, '🔥')
  await react(kirill, dev.id, code.id, '🔥')
  await call(boris.token, 'POST', `/channels/${dev.id}/threads`, {
    name: 'Индекс для ленты',
    messageId: code.id,
  }).catch(() => undefined)
  await say(dima, dev.id, 'Красота. Ревью сделаю после обеда, PR в `feature/feed-index`?')
  await say(boris, dev.id, 'Да, ссылка в описании задачи 👍')

  // #дизайн and #мемы, so the sidebar shows unread channels.
  await say(vika, design.id, 'Обновила палитру тёмной темы — стало мягче для глаз 🌙')
  await say(dima, memes.id, 'Когда тесты прошли с первого раза: 😳')

  // Pin the release note.
  await call(anna.token, 'PUT', `/channels/${general.id}/pins/${release.id}`)

  // A second server, so the server list is not lonely.
  const { guild: club } = await call(boris.token, 'POST', '/guilds', {
    name: 'Велоклуб',
    locale: 'ru',
  })
  await call(boris.token, 'PUT', `/guilds/${club.id}/icon`, await picture('🚲', '#3ba55d'))
  const clubInvite = (
    await call(
      boris.token,
      'POST',
      `/channels/${club.channels.find((c) => c.type === 'text').id}/invites`,
      {},
    )
  ).invite
  await call(anna.token, 'POST', `/invites/${clubInvite.code}`)

  // DMs.
  const { channel: dm } = await call(anna.token, 'POST', '/users/@me/channels', {
    recipientIds: [vika.id],
  })
  await say(vika, dm.id, 'Анна, глянешь макет профиля, когда будет минутка?')
  await say(anna, dm.id, 'Конечно! Скинь ссылку, посмотрю после созвона 🙌')
  await say(vika, dm.id, 'Готово, в #дизайн. Спасибо!')

  // Anna has read everything: no "new messages" bars on the screenshots.
  await call(anna.token, 'POST', `/guilds/${guild.id}/ack`)
  await call(anna.token, 'POST', `/guilds/${club.id}/ack`)

  process.stdout.write(
    `Demo ready. Sign in as ${anna.username} (password in scripts/demo-data.mjs).` + '\n',
  )
  process.stdout.write(`Server: ${guild.id}, #общий: ${general.id}, voice: ${lounge?.id}` + '\n')
  if (HOLD) holdOnline(people)
}

/** Anna, Boris and Vika online, Dima away, Kirill busy, Lena offline. */
const holdOnline = ({ anna, boris, vika, dima, kirill }) => {
  goOnline(anna)
  goOnline(boris)
  goOnline(vika)
  goOnline(dima, 'idle')
  goOnline(kirill, 'dnd')
  process.stdout.write('Everyone is online; Ctrl+C to stop.' + '\n')
}

/** Signs in the people of an earlier demo run and keeps them online. */
const online = async () => {
  const people = {}
  for (const { key } of PEOPLE) {
    const { token } = await call(null, 'POST', '/auth/login', {
      login: `${key}_${RUN}`,
      password: PASSWORD,
    })
    people[key] = { key, token }
  }
  holdOnline(people)
}

;(ONLINE ? online() : main()).catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exit(1)
})
