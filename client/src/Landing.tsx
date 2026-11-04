import { useEffect, useState } from 'react';
import { api } from './api';

const FEATURES = [
  {
    icon: '✨',
    title: 'ИИ собирает схему по словам',
    text: 'Опиши автоматизацию обычным языком — FlowPilot сам построит граф из нод. Без ручного кликанья.'
  },
  {
    icon: '⚡',
    title: 'Мгновенный запуск',
    text: 'Никакого Docker и облака: npm install → и конструктор работает. Локально и бесплатно.'
  },
  {
    icon: '📊',
    title: 'Живые данные на канве',
    text: 'После запуска на каждой ноде видно вход/выход в реальном времени. Ошибки подсвечиваются.'
  },
  {
    icon: '🩺',
    title: 'ИИ-доктор',
    text: 'Нода упала? Кнопка «Починить с ИИ» диагностирует ошибку и предложит исправленный конфиг.'
  },
  {
    icon: '📨',
    title: 'Готовые интеграции',
    text: 'Telegram-нода, публичные HTML-формы, HTTP к любым API, JS-код, циклы и условия.'
  },
  {
    icon: '🧪',
    title: 'ИИ-тесты',
    text: 'Генератор тестовых запросов: happy path, boundary и negative — готовыми fetch-сниппетами.'
  }
];

export default function Landing() {
  const [m, setM] = useState<any>(null);
  useEffect(() => {
    api.metrics().then(setM).catch(() => {});
  }, []);

  return (
    <div className="min-h-full bg-ink-950 text-slate-200">
      <header className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-5">
        <span className="text-2xl">🛸</span>
        <span className="text-lg font-bold">
          Flow<span className="text-blue-400">Pilot</span>
        </span>
        <span className="ml-auto rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
          {m?.runs !== undefined ? `⚙ ${m.runs} запусков · ${m.workflows} воркфлоу` : '⚙ онлайн'}
        </span>
        <a href="/app" className="btn-primary">
          Открыть конструктор →
        </a>
      </header>

      <section className="mx-auto max-w-5xl px-5 pb-16 pt-10 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-5xl">
          Автоматизации <span className="text-blue-400">по описанию</span>, а не по схемам
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400">
          FlowPilot — визуальный конструктор автоматизаций (аналог n8n / Zapier) с ИИ-копилотом. Опиши что нужно словами —
          получи рабочую схему. Собери руками — ИИ объяснит, починит и протестирует.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <a href="/app" className="btn-primary !px-6 !py-3 !text-base">
            🚀 Начать бесплатно
          </a>
          <a href="/app" className="btn-ghost !px-6 !py-3 !text-base">
            Посмотреть демо
          </a>
        </div>
        <div className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['12', 'типов нод'],
            ['100%', 'локально и офлайн'],
            ['≤ 1 сек', 'отклик webhook'],
            ['0₸', 'лицензий']
          ].map(([v, l]) => (
            <div key={l} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
              <div className="text-2xl font-black text-blue-400">{v}</div>
              <div className="mt-1 text-xs text-slate-500">{l}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(f => (
            <div key={f.title} className="rounded-2xl border border-ink-700 bg-ink-900 p-5 transition-colors hover:border-blue-500/50">
              <div className="text-2xl">{f.icon}</div>
              <div className="mt-3 text-sm font-semibold text-slate-100">{f.title}</div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-20">
        <div className="rounded-2xl border border-ink-700 bg-gradient-to-br from-ink-900 to-ink-850 p-8 text-center">
          <h2 className="text-2xl font-bold">Попробуй прямо сейчас</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">
            Внутри уже развёрнут демо-воркфлоу «Воронка: счёт → Telegram». Открой конструктор, нажми ▶ и смотри, как
            данные текут по нодам.
          </p>
          <a href="/app" className="btn-primary mt-6 !px-8 !py-3 !text-base">
            Открыть конструктор →
          </a>
        </div>
        <p className="mt-8 text-center text-xs text-slate-600">FlowPilot · локальный конструктор автоматизаций · данные не покидают ваш сервер</p>
      </section>
    </div>
  );
}
