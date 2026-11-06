import fs from 'node:fs';
import path from 'node:path';

export const dataDir = () => process.env.AGENT_DATA_DIR || 'data';

export function loadConfig(file = 'config.json') {
  // מסיר BOM (Notepad ב-Windows מוסיף אותו לפעמים)
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

/**
 * הגדרות להרצה: config.json אם קיים (במחשב), אחרת config.example.json (בשרת/בענן),
 * ומעליהן משתני סביבה – כך הסודות לא נשמרים בקבצים:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_IDS (מופרדים בפסיק), BROWSER_CHANNEL
 */
export function loadRuntimeConfig(file) {
  const cfg = loadConfig(file || (fs.existsSync('config.json') ? 'config.json' : 'config.example.json'));
  if (process.env.TELEGRAM_BOT_TOKEN) {
    cfg.telegram = {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatIds: (process.env.TELEGRAM_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
    };
  }
  if (process.env.BROWSER_CHANNEL !== undefined) cfg.browserChannel = process.env.BROWSER_CHANNEL;
  return cfg;
}

/** שעה ותאריך לפי שעון ישראל (גם כשהשרת בחו"ל). */
export function israelNow(d = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24, minute: Number(parts.minute) };
}

export function log(...a) {
  const line = `[${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}] ${a.join(' ')}`;
  console.log(line);
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.appendFileSync(path.join(dataDir(), 'agent.log'), line + '\n', 'utf8');
}

/** משלים לאירוע את ברירות המחדל ואת הגדרות האתר שלו (לפי הדומיין). */
export function resolveEvent(cfg, ev) {
  let host = '';
  try {
    host = new URL(ev.url).hostname;
  } catch {}
  const site = (cfg.sites || []).find((s) => s.host && host.endsWith(s.host)) || {};
  return {
    site: 'auto', // מזהה לבד: קופת ת"א / Ticketmaster / כללי
    ...cfg.defaults,
    generic: site.generic,
    ...(site.site ? { site: site.site } : {}),
    ...ev,
    name: ev.name || host + new URL(ev.url).pathname,
  };
}
