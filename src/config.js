import fs from 'node:fs';
import path from 'node:path';

export function loadConfig(file = 'config.json') {
  // מסיר BOM (Notepad ב-Windows מוסיף אותו לפעמים)
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

export function log(...a) {
  const line = `[${new Date().toLocaleString('he-IL')}] ${a.join(' ')}`;
  console.log(line);
  const dir = process.env.AGENT_DATA_DIR || 'data';
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'agent.log'), line + '\n', 'utf8');
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
