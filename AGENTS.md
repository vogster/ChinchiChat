# AGENTS.md

Chinchi Chat — self-hosted open-source альтернатива Discord (текст, ЛС, голос/видео; Web, Desktop, Mobile).
Архитектура и фазы — [PLAN.md](PLAN.md), прогресс — [TODO.md](TODO.md).

## Рабочий процесс

- Перед работой сверяйся с `TODO.md`; после завершения пункта отмечай `[x]` (только если он покрыт тестами). Пропущенный в фазе пункт не оставляй молча: допиши `— *отложено: причина*`.
- Если решение расходится с `PLAN.md` — обнови план в том же коммите.
- TDD: сначала тест (убедись, что он падает), потом реализация. Порог покрытия 80% зашит в vitest.
- Перед коммитом — по **всему монорепо**, а не только по изменённому пакету: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` (изменение схем в `@chinchi/shared` ломает фикстуры в `sdk`/`web`).
- Коммиты — conventional commits на английском (`feat(server): ...`, `chore: ...`), ветка `main`.
- Документация (PLAN/TODO/README) — на русском. Код, комментарии, сообщения коммитов — на английском.

## Команды

```bash
pnpm install
pnpm dev:up | dev:down | dev:reset | dev:logs   # docker compose: postgres, valkey, rustfs, livekit, mailpit
pnpm dev                                        # все dev-серверы через turbo
pnpm lint | typecheck | test | test:coverage | build | format
pnpm e2e                                        # Playwright по production-сборке web
pnpm --filter @chinchi/server test:unit           # быстрые тесты без Docker
pnpm --filter @chinchi/server db:generate         # SQL-миграция из drizzle-схемы
node scripts/demo-data.mjs [--hold]               # демо-сервер на dev-стеке (лимиты: RATE_LIMIT=off)
node scripts/demo-screenshots.mjs <суффикс>       # скриншоты README в docs/screenshots
```

Бэкап установки — `deploy/backup.sh` / `deploy/restore.sh` (едут в релиз; файлы хранилища передаются через stdin/stdout контейнера, без монтирования путей хоста — так скрипты работают и в Git Bash).

Релиз: поднять версию по умолчанию (`CHINCHI_VERSION`) в `deploy/docker-compose.yml`, закоммитить, затем `git tag vX.Y.Z && git push origin vX.Y.Z` — workflow `release.yml` публикует образы в GHCR и релиз с файлами установки (и падает, если версия в compose не совпадает с тегом).

## Структура

- `apps/server` — Fastify + zod type provider, Drizzle + postgres.js. Модули по доменам в `src/modules/<domain>/`.
- `apps/web` — React 19 + Vite + Tailwind 4 + TanStack Router (file-based, `src/routes/`) и Query. `src/routeTree.gen.ts` генерируется плагином и коммитится.
- `packages/sdk` — REST-клиент (`createApiClient`), общий для всех клиентов. Ошибки — `ApiError` с `code`.
- `packages/markdown` — парсер markdown сообщений в AST (`parseMarkdown`), `collectMentions`, `isEmojiOnly`. Только данные, без HTML: клиенты рендерят AST своими компонентами.
- `packages/shared` — zod-схемы и типы для сервера и клиентов (Snowflake ID и т.д.). Экспортирует TS-исходники.
- `packages/config` — общие tsconfig, eslint, prettier, vitest.
- `e2e/` — Playwright против production-сборок сервера (:3100) и web (:4173) на dev-стеке (`pnpm dev:up`); письма читаются из Mailpit (`support/mailpit.ts`), у каждого теста свой пользователь (`newUser()`). Первый раз: `pnpm --filter @chinchi/e2e e2e:install`. В `getByLabel` и в ссылках разделов настроек (`getByRole('link', { name: 'Боты' })`) используй `exact: true`: названия серверов в тестах начинаются с тех же слов, и клик до отрисовки страницы попадает в сервер.
- `deploy/` — docker compose и конфиги сервисов.

## Соглашения

- ID — Snowflake, в JS всегда строка, в Postgres `bigint` (колонка `snowflake()` из `src/db/columns.ts`).
- API под префиксом `/api/v1` (кроме `/health`, `/ready`).
- HTTP-ответы: `{ success: true, data }` / `{ success: false, code, error, details? }`. `code` — стабильный машиночитаемый код (`USERNAME_TAKEN`, `INVALID_CREDENTIALS`, ...), клиенты переводят по нему. Ошибки для клиента — через `HttpError` (`src/http/http-error.ts`); 5xx не раскрывают детали.
- Аутентификация: `requireAuth(request)` в обработчике. Сессия — cookie `chinchi_session` (web) или `Authorization: Bearer` (native). Изменяющие запросы без Bearer проходят проверку Origin (CSRF).
- Конфиг только через `loadConfig()` (zod), ошибки называют переменную, но не её значение.
- Иммутабельность, маленькие файлы (<400 строк), без `console.log` (eslint `no-console`), логирование через pino.
- Зависимости фиксируются точными версиями (без `^`).
- Интеграционные тесты — `*.int.test.ts`; Postgres и Valkey поднимаются Testcontainers'ом один раз на прогон. Приложение для них — `createTestApp()` из `apps/server/test/test-app.ts`, сброс состояния — `resetState()`. Файлы выполняются последовательно (общая БД).
- Fastify-плагины, которые должны действовать на всё приложение (хуки, декораторы), оборачивай в `fastify-plugin` — иначе они инкапсулируются и молча ничего не делают.
- Лимиты запросов задаются в `src/http/rate-limit.ts`, для маршрута — через `config: { rateLimit: ... }`.

## Подводные камни

- **TypeScript 6.0, не 7.x**: `typescript-eslint` пока поддерживает только `<6.1`.
- **pnpm 11** не ставит пакеты моложе суток (`minimumReleaseAge`) и блокирует install-скрипты. Разрешения — в `allowBuilds` в `pnpm-workspace.yaml`. Не добавляй `minimumReleaseAgeExclude`, бери предыдущую версию.
- **turbo** сам пишет AGENTS.md при обнаружении агента — отключено через `"agentGuidance": false` в `turbo.json`.
- **zod 4**: проверки в цепочке выполняются все, даже после провала предыдущей. Если `refine` зависит от формата — объединяй проверки в один `refine`.
- **Миграции**: путь к `drizzle/` передаёт вызывающий (`src/server.ts`, `test/database.ts`), потому что модуль лежит на разной глубине в `src/` и в бандле `dist/`.
- **Tailwind**: не смешивай утилиты одного CSS-свойства в одном элементе (`bg-elevated` + `bg-accent`) — побеждает порядок в CSS, а не порядок классов. Состояния — через варианты (`hover:`, `data-[status=active]:`). Цвета — только семантические токены (`bg-main`, `text-muted`), заданы в `apps/web/src/styles.css`.
- **Авторизация в серверах** — только через `createGuildAccess` (`requireMember` / `requirePermission` / `requireOwner` / `requireChannel`); не участникам и тем, кто не видит канал, отвечаем 404 (`UNKNOWN_GUILD`/`UNKNOWN_CHANNEL`), чтобы id нельзя было перебирать. Каналы наружу отдаём через `views` (скрытые отфильтрованы).
- **Права** считает только `@chinchi/shared` (`computeBasePermissions` / `computeChannelPermissions` / `canManageRole`) — и сервер, и web (`useGuildPermissions`). Выдавать можно только свои права (владелец и Administrator — любые); роли — только ниже своей высшей. Любое событие gateway, зависящее от канала, проходит через `applyGuildEvent` (`apps/server/src/gateway/visibility.ts`).
- **Web-роуты**: `_app` — вход + общее gateway-соединение; `_app/_shell` — рамка чата; полноэкранные страницы (`server-settings`) лежат в `_app` вне `_shell`, чтобы переход не переподключал gateway. Кеш сервера правится через `features/guilds/guild-cache.ts` (и из dispatch, и после своих мутаций).
- **Кнопки**: ширина — проп `fullWidth`, не класс `w-auto` поверх варианта (конфликт утилит Tailwind).
- **ЛС** — каналы с `guild_id = NULL` (`dm`/`group_dm`), участники в `channel_recipients`. `channels.resolve` отдаёт и ЛС (права — `DM_PERMISSIONS` из `dm.service`), серверные операции — только через `resolveGuild` (ЛС → 404). События канала — `channelEvents.publish(channel, ...)`: он сам выбирает `guild:` или топики участников. `guildId` у сообщений и их событий может быть `null`. В вебе ЛС — `/channels/@me/$channelId`, список — `dmKeys.all` (seed из READY).
- **Голос** (`modules/voice`): LiveKit необязателен (`LIVEKIT_*`), API комнат — интерфейс `VoiceRooms`, в тестах `createFakeRooms()` (`test/voice.ts`), вебхуки подписываются `signedWebhook()`. Состояние голоса в Valkey привязано к подключению LiveKit (`participant.sid`): выход снимает только своё подключение, запоздалый вход ушедшего игнорируется. Всё, что может отнять право (роли, overwrites, уход с сервера, блокировки), перепроверяется стражем `voice-guard.ts` по событиям шины — новое такое действие должно публиковать событие. В вебе LiveKit спрятан за `VoiceRoom` (`features/voice/voice-room.ts`), в тестах — `createFakeVoice()` (`renderApp` возвращает `voice`).
- **Вход с 2FA**: `api.auth.login` возвращает либо `{ user }`, либо `{ mfaTicket }` — второй шаг `api.auth.loginMfa`. Коды (`mfa.service.ts`) тратятся атомарно, не проверяй их отдельно от `spendCode`.
- **Профиль**: человека в вебе показывай через `ProfileTrigger` (`features/profile`) — клик открывает карточку; `guildId` — сервер, откуда открыли (роли, никнейм), иначе null. На сервере имя участника — никнейм, если есть (`nickname ?? displayName ?? username`).
- **Realtime**: сервисы публикуют события через `EventBus` (`guild:<id>`/`user:<id>`), шлюз раздаёт их подписанным соединениям. Новое событие для клиента — добавь схему в `dispatchSchemas` (`@chinchi/shared`), иначе шлюз его не перешлёт; обработку в вебе — в `apply-dispatch.ts`. В тестах веба шлюз подменяется `createFakeGateway()` (`renderApp` возвращает `gateway.emit`).
- **Шина событий**: в проде Valkey Streams (`redis-event-bus.ts`), `s` = позиция в потоке; в тестах — `createMemoryEventBus` (с `published` для проверок).
- **Web**: строки только через i18n (`src/locales/{ru,en}.json`, ключи должны совпадать — есть тест); ошибки API — `errorMessage(t, error)`. API в компонентах — `useApi()`, в роутере — `context.api`. Тесты рендерят всё приложение через `renderApp()` с `createFakeApi()` (`src/test/`).
- **Vite dev после установки зависимостей** может отдать две копии React («Invalid hook call») — перезапусти dev-сервер.
- **Кеш turbo**: задачи `typecheck`/`test`/`lint` зависят от `^typecheck`, иначе изменения в `@chinchi/shared` не сбрасывают кеш потребителей и «зелёный» результат может быть устаревшим. При сомнениях — `pnpm turbo run typecheck --force`.
- **Типы запросов из zod**: для клиента — `z.input` (поля с `.default()` необязательны), для сервера после валидации — `z.output`.
- **Доступные имена**: не собирай имя ссылки из видимого текста и скрытого `sr-only`-span — пробел на стыке теряется (`мемы(есть…)`). Задавай `aria-label` явно.
- **MinIO не используется** (образы больше не публикуются) — S3-хранилище RustFS; код работает через обычный S3 API.
- **Файлы**: доступ к S3 только через `createObjectStorage` (`src/storage/object-storage.ts`); хранилище необязательно — сервисы получают `storage: ObjectStorage | undefined`. В интеграционных тестах RustFS поднимается Testcontainers'ом (`test/storage.ts`), `createTestApp({ storage: false })` — инстанс без загрузок. Клиенту нельзя верить в типе файла: inline показываем только то, что прошло `detectImageType` (`@chinchi/shared`, общий для сервера и клиентов).
- **Исходящие запросы по ссылкам пользователей** — только через `createSafeFetcher` (`src/net/safe-fetch.ts`): проверка адреса после DNS в `lookup` соединения, порты 80/443, ручные редиректы. Обходить его (`fetch`, `undici.request` напрямую) нельзя. В тестах — `createTestApp({ linkPreviewsReachLocalhost: true })`; превью ссылок в тестах выключены по умолчанию (`LINK_PREVIEWS=off`).
- **Кеш сообщений в вебе**: копии из шлюза (`MESSAGE_UPDATE`) не знают `me` у реакций — при применении сохраняй реакции из кеша. Счётчики упоминаний живут только в кеше шлюза (`realtime/mention-counts.ts`).
- **Атомарные лимиты** (реакции на сообщение, закрепления в канале) проверяй в транзакции под блокировкой строки-владельца (`SELECT … FOR UPDATE`), иначе параллельные запросы их превысят.
- **E2E и S3**: у e2e-сервера свой бакет `chinchi-e2e` — сервер при старте перезаписывает CORS бакета своим `WEB_ORIGINS`, и общий с dev бакет ломал бы загрузки одному из них.
- **Фоновые задачи** (превью): очередь — строки в Postgres с арендой (`claimPreviewJobs`, `FOR UPDATE SKIP LOCKED`), без отдельного брокера. Воркер стартует в `server.ts` после `listen`, в тестах — `app.previews.runOnce()`; останавливается хуком `onClose`.
- **Пользователь наружу** — только через `toPublicUser` (`users/user.mapper.ts`): там `avatarUrl`. Не собирай `{ id, username, displayName }` руками.
- **sharp**: только для форматов, прошедших `detectImageType`; всегда `limitInputPixels` и `pages: 1` (исключение — анимированные эмодзи в `createEmojiImage`: ограниченное число кадров и бюджет пикселей на все кадры). Бинарники — из `@img/sharp-*` (в `allowBuilds` стоит `sharp: false`).
- **Шифрование хранилища** (`S3_ENCRYPTION=on`): ключ KMS `default` RustFS сам не создаёт — его создаёт `ensureKmsKey` (`src/storage/storage-kms.ts`) через admin API при `ensureBucket`. У RustFS (dev, CI, Testcontainers) включён локальный KMS (`RUSTFS_KMS_*`). В Git Bash передавай пути в `docker run -e` с `MSYS_NO_PATHCONV=1`, иначе `/data/...` превратится в путь Windows.
- **AWS SDK**: клиенты S3 создаются с `requestChecksumCalculation: 'WHEN_REQUIRED'`, иначе в presigned URL попадают checksum-заголовки, которых браузер не пришлёт. Версии SDK выходят ежедневно — бери ту, что старше суток (`minimumReleaseAge`).
- **SMTP Mailpit в dev — порт 2525**, не 1025: на macOS 1025 может быть занят (FinderSync), и письма молча уходят в никуда (`Greeting never received`).
- **Сырые параметры в `sql\`...\``** не проходят маппинг Drizzle: `Date`передавай как`${date.toISOString()}::timestamptz`.
- **Почта отправляется в фоне** (`dispatch` в `account-email.service.ts`); в тестах используй `createOutbox()` из `apps/server/test/outbox.ts` и `waitForMessage`.
- **Docker на macOS (OrbStack)**: если нет `/var/run/docker.sock`, задай `DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock` — иначе Testcontainers не найдёт Docker.
