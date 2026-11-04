import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Workflow } from '../core/types';

const dir = fileURLToPath(new URL('./data', import.meta.url));
const wfFile = path.join(dir, 'workflows.json');
const setFile = path.join(dir, 'settings.json');
const histFile = path.join(dir, 'history.json');

function readJson(file: string, fallback: any) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: any) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // атомарная запись: tmp-файл + rename (файл не останется наполовину записанным)
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error('write error', file, e);
  }
}

export interface Settings {
  aiKey: string;
  aiBaseUrl: string;
  aiModel: string;
  telegramBotToken: string;
  telegramChatId: string;
}

function readSettingsFile(): Settings {
  return { aiKey: '', aiBaseUrl: 'https://api.openai.com/v1', aiModel: 'gpt-4o-mini', telegramBotToken: '', telegramChatId: '', ...readJson(setFile, {}) };
}

export const store = {
  loadWorkflows(): Record<string, Workflow> {
    return readJson(wfFile, {});
  },
  saveWorkflows(w: Record<string, Workflow>) {
    writeJson(wfFile, w);
  },
  rawSettings(): Settings {
    // Только файл (без env) — для сохранения, чтобы env-значения не «засвечивались» в файле
    return readSettingsFile();
  },
  loadSettings(): Settings {
    // Переменные окружения (Render/VPS/.env) имеют приоритет — они переживают перезапуски
    const e = process.env;
    const file = readSettingsFile();
    return {
      aiKey: e.AI_KEY || file.aiKey,
      aiBaseUrl: e.AI_BASE_URL || file.aiBaseUrl,
      aiModel: e.AI_MODEL || file.aiModel,
      telegramBotToken: e.TELEGRAM_BOT_TOKEN || file.telegramBotToken,
      telegramChatId: e.TELEGRAM_CHAT_ID || file.telegramChatId
    };
  },
  saveSettings(s: Settings) {
    writeJson(setFile, s);
  },
  loadHistory(): Record<string, any[]> {
    return readJson(histFile, {});
  },
  pushHistory(wfId: string, entry: any) {
    const all = readJson(histFile, {});
    const list = all[wfId] || [];
    list.push(entry);
    all[wfId] = list.slice(-50);
    writeJson(histFile, all);
  }
};
