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
npm start
```
→ http://localhost:8787 (статика + API в одном)

## Что умеет

- Canvas-конструктор: 9 типов нод — Manual, Webhook, Schedule, HTTP, IF, Set, JS Code, Respond, Delay
- Шаблоны `{{field.path}}` в URL, headers и body
- Живое выполнение: ноды подсвечиваются, по каждой — вход/выход/ошибка/время
- **Webhook**: POST на URL воркфлоу → видно выполнение в реальном времени (WebSocket)
- **Schedule**: воркфлоу гоняется каждые N минут
- Журнал запусков, 4 готовых шаблона, экспорт/импорт JSON
- **✨ ИИ-копилот**: описание словами → готовый воркфлоу; «📖» — объяснение графа
- Офлайн-режим: встроенные mock-сервисы + шаблонный ИИ без ключа

## Чем лучше оригиналов

| | Zapier | n8n | FlowPilot |
|---|---|---|---|
| Цена | $ за каждый шаг | free (self-host) | бесплатно |
| Развёртывание | SaaS, аккаунт | Docker, конфиги | `npm install` и работает |
| ИИ | базовый (платно) | Copilot (новый, платно) | NL→workflow, explain, любой OpenAI-совместимый API, включая локальный Ollama |
| Данные | лог в облаке | журнал | живые данные по каждой ноде на канве |
| Демо без интернета | нет | нет | есть (mock-сервисы) |

## Архитектура

```
core/     — типы + движок выполнения (чистый TS, без зависимостей)
server/   — Express + WebSocket + JSON-хранилище + ИИ (LLM / fallback)
client/   — React + Vite + React Flow + Zustand + Tailwind
```

Поток: canvas (React Flow) → store (zustand) → REST/WS → движок (core/engine) → события back на канву.

## API

- `GET /api/workflows` · `POST /api/workflows` · `PUT/DELETE /api/workflows/:id`
- `POST /api/workflows/:id/run` — ручной запуск
- `POST /api/webhook/:id` — триггер
- `POST /api/ai/generate` · `POST /api/ai/explain`
- `GET /api/templates` · `GET/PUT /api/settings` · `GET /api/workflows/:id/history`
- `GET /api/mock/orders` · `POST /api/mock/notify` — демо без интернета

## Пример

```bash
curl -X POST http://localhost:8787/api/webhook/<ID-ВОРКФЛОУ> \
  -H 'Content-Type: application/json' \
  -d '{"subject": "Счёт №123 за облако", "amount": 15000}'
```

## ИИ

Ключ ставится в интерфейсе (⚙) и хранится в `server/data/settings.json`.
Работает любой OpenAI-совместимый endpoint: OpenAI, OpenRouter, Groq, Ollama
(`http://localhost:11434/v1`, модель `llama3.1`). Без ключа — шаблонный офлайн-генератор.

## Roadmap

- Реальные интеграции: Telegram Bot API, Slack, Google Sheets, SMTP
- Docker-развёртывание, авторизация, команды, версионность воркфлоу
- Параллельные ветки, merge данных, изолированный прогон ноды (unit-тест)
- Маркетплейс шаблонов
