# Chinchi Chat

Бесплатная open-source альтернатива Discord, которую можно развернуть на своём сервере.

> 🚧 Версия до 1.0. Работает, но API и данные ещё могут меняться между версиями.

## Возможности

- Серверы, текстовые и голосовые каналы, категории, инвайты, каналы объявлений, треды
- Сообщения в реальном времени: ответы, реакции, вложения, markdown, упоминания, закрепы, превью ссылок, поиск, свои эмодзи
- Роли и гибкие права доступа, модерация: баны, тайм-ауты, жалобы, автомодерация, журнал действий
- Друзья, личные сообщения и группы до 10 человек
- **Зашифрованные беседы**: сквозное шифрование (MLS) сообщений, файлов и звонков в личных сообщениях и группах; сервер их не читает — [как это устроено](docs/encryption.md)
- Голос, видео и демонстрация экрана на базе LiveKit, звонки в личных сообщениях
- Боты, слэш-команды и вебхуки
- Двухфакторная аутентификация, уведомления, экспорт своих данных
- Шифрование файлов на диске сервера
- Развёртывание одной командой через `docker compose` — см. [гайд по установке](docs/self-hosting.md)
- В планах: Desktop (Tauri), Mobile (iOS/Android)

## Установка

Готовые образы, на сервере нужны только два файла. Направьте на сервер три DNS-имени и выполните:

```bash
mkdir chinchi && cd chinchi
curl -fsSLO https://github.com/vogster/ChinchiChat/releases/latest/download/docker-compose.yml
curl -fsSL -o .env https://github.com/vogster/ChinchiChat/releases/latest/download/env.example
# заполните .env: домены и секреты
docker compose up -d
```

Подробно — [docs/self-hosting.md](docs/self-hosting.md): требования, порты, обновление, резервные копии, голос за NAT, сборка из исходников.

## Разработка

Нужны Node.js 24+, pnpm 11 и Docker (на macOS удобно через [OrbStack](https://orbstack.dev)).

```bash
pnpm install
pnpm dev:up          # Postgres, Valkey, RustFS (S3), LiveKit, Mailpit
cp apps/server/.env.example apps/server/.env
pnpm dev             # сервер на :3000, web на http://localhost:5173
```

| Сервис          | Адрес                                 |
| --------------- | ------------------------------------- |
| Web             | http://localhost:5173                 |
| API             | http://localhost:3000/health          |
| Mailpit (почта) | http://localhost:8025                 |
| RustFS консоль  | http://localhost:9001/rustfs/console/ |
| LiveKit         | ws://localhost:7880                   |

Проверки: `pnpm lint`, `pnpm typecheck`, `pnpm test` (интеграционным тестам нужен Docker), `pnpm test:unit` в `apps/server` — только быстрые.

## Документы

- [PLAN.md](PLAN.md) — архитектура, стек и фазы разработки
- [TODO.md](TODO.md) — текущий прогресс
- [docs/self-hosting.md](docs/self-hosting.md) — установка на свой сервер
- [docs/encryption.md](docs/encryption.md) — шифрование: что защищено, от кого и как это устроено

## Лицензия

[AGPL-3.0](LICENSE)
