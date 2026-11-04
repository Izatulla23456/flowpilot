# 🛸 FlowPilot

Прототип **n8n / Zapier** — визуальный конструктор автоматизаций **с ИИ-копилотом**.

> Задача проекта: не просто копия продукта, которым пользуются миллионы, а версия, которая его превосходит.

## Запуск

```bash
npm install
npm run dev
```
→ http://localhost:5173 (клиент, сервер на 8787 — проксируется)

Продакшен:
```bash
npm run build
npm start          # или: npx tsx server/index.ts
```
→ http://localhost:8787 — лендинг, `/app` — конструктор, статика + API в одном.

Деплой: PM2 (`ecosystem.config.cjs`) + Caddy (`deploy/Caddyfile`, авто-HTTPS) или Docker (`Dockerfile`).
Бэкап данных: `./backup.sh` (держит последние 14 снапшотов `server/data/`).

## Что умеет

- Canvas-конструктор: **12 типов нод** — Manual, Webhook, Schedule, **Form (публичная HTML-форма)**, HTTP (с retry+backoff), IF (подписи «да/нет» на рёбрах), Set, JS Code, Respond, Delay, **Loop/ForEach** (fan-out до 500 итераций), **Telegram** (Bot API, mock без токена)
- Шаблоны `{{field.path}}` в URL, headers, body, тексте (работают кириллические имена полей)
- Живое выполнение: ноды подсвечиваются, по каждой — вход/выход/ошибка/время
- **Webhook**: POST на URL воркфлоу → видно выполнение в реальном времени (WebSocket)
- **Schedule**: воркфлоу гоняется каждые N минут
- Журнал запусков, готовые шаблоны, экспорт/импорт JSON
- **Undo/redo** (Ctrl+Z / Ctrl+Shift+Z), подсказка «🪄 что подключить дальше» — клик добавляет и соединяет ноду
- **✨ ИИ-копилот**: описание словами → готовый воркфлоу; «📖» — объяснение графа
- **🩺 ИИ-доктор**: нода упала → диагностика + предложенный исправленный конфиг (кнопка «Починить с ИИ»)
- **🧪 ИИ-тесты**: happy path / boundary / negative запросы готовыми fetch-сниппетами
- Офлайн-режим: mock-сервисы + шаблонный ИИ без ключа

## Чем лучше оригиналов

| | Zapier | n8n | FlowPilot |
|---|---|---|---|
| Цена | $ за каждый шаг | free (self-host) | бесплатно |
| Развёртывание | SaaS, аккаунт | Docker, конфиги | `npm install` и работает |
| ИИ | базовый (платно) | Copilot (новый, платно) | NL→workflow, explain, **доктор, тесты**; любой OpenAI-совместимый API, включая локальный Ollama |
| Данные | лог в облаке | журнал | живые данные по каждой ноде на канве |
| Демо без интернета | нет | нет | есть (mock-сервисы + офлайн-ИИ) |

## Архитектура

```
core/     — типы + движок выполнения (чистый TS, без зависимостей)
server/   — Express + WebSocket + JSON-хранилище (атомарные записи) + ИИ (LLM / fallback)
client/   — React + Vite + React Flow + Zustand + Tailwind
```

Поток: canvas (React Flow) → store (zustand) → REST/WS → движок (core/engine) → события back на канву.

## Безопасность

- **Админ-токен**: `.env` → `FLOWPILOT_ADMIN_TOKEN=…` (см. `.env.example`). Защищает все API-мутации и чтение воркфлоу; клиент сам попросит токен при 401. Публичными остаются: лендинг, формы, webhook, метрики.
- Секреты (AI-ключ, Telegram-токен) хранятся на сервере и **никогда не отдаются клиенту**.
- SSRF-защита: HTTP-нода не ходит во внутренние адреса (10.*, 192.168.*, 169.254.*, localhost…).
- Rate limit: webhook 30/мин/IP, AI 10/мин/IP.
- Атомарные записи JSON (tmp + rename) — нет порчи данных при падении.

## API

- `GET /api/health` · `GET /api/metrics` (запуски, ошибки, uptime — публично)
- `GET/POST /api/workflows` · `GET/PUT/DELETE /api/workflows/:id` (нужен токен)
- `POST /api/workflows/:id/run` — ручной запуск
- `POST /api/webhook/:id` — триггер (публично)
- `GET/POST /api/form/:id` — публичная форма (HTML + приём данных)
- `POST /api/integration/telegram` — отправка (реальная или mock)
- `POST /api/ai/generate` · `/explain` · `/fix` · `/tests`
- `GET /api/templates` · `GET/PUT /api/settings` · `GET /api/workflows/:id/history`
- `GET /api/mock/orders` · `POST /api/mock/notify` — демо без интернета

## Пример

```bash
curl -X POST http://localhost:8787/api/webhook/<ID-ВОРКФЛОУ> \
  -H 'Content-Type: application/json' \
  -d '{"subject": "Счёт №123 за облако", "amount": 15000}'
```

## ИИ

Ключ ставится в интерфейсе (⚙) и хранится на сервере.
Работает любой OpenAI-совместимый endpoint: OpenAI, OpenRouter, Groq, Ollama
(`http://localhost:11434/v1`, модель `llama3.1`). Без ключа — шаблонный офлайн-генератор.

## Тесты

```bash
npx vitest run     # клиент (canvas, undo/redo-паттерн)
npx tsx loop-test.mjs  # движок: ForEach/fan-out
node smoke.mjs     # сквозной: webhook-демо
node smoke2.mjs    # форма, telegram, ИИ-доктор, ИИ-тесты, метрики, лендинг
```

## Roadmap

- Google Sheets, SMTP, Slack-интеграции
- Мульти-пользовательность, SSO, роли
- Версионность воркфлоу, merge-нода, marketplace шаблонов
