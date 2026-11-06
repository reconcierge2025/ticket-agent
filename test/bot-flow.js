// סימולציה של שיחה עם הבוט (בלי טלגרם אמיתי): קישור → דוח, /list, כפתור 🔥, /status.
// הרצה: node test/bot-flow.js <קישור>
import assert from 'node:assert/strict';
import fs from 'node:fs';
process.env.AGENT_DATA_DIR = 'data/bot-flow';
fs.rmSync('data/bot-flow', { recursive: true, force: true });

const { loadConfig } = await import('../src/config.js');
const { handleUpdates } = await import('../src/bot.js');
const { createAgent } = await import('../src/core.js');

const cfg = { ...loadConfig('config.example.json'), telegram: { botToken: 'PUT_', chatIds: ['111'] } };
const db = { seen: {}, best: {}, history: [] };
const sent = [];
const notify = async (text, opts = {}) => sent.push({ text, ...opts });
const agent = createAgent({ cfg, db, notify });
const pending = [];
const h = agent.handlers(pending);
const msg = (id, text) => ({ update_id: id, message: { chat: { id: 111 }, from: { first_name: 'test' }, text } });

// handleUpdates שולח תשובות דרך sendTelegram (לא מוגדר → מודפס). בודקים את ה-handlers ישירות:
const r1 = h.onWatch(process.argv[2], null, { from: '111', maxPrice: null });
assert.match(r1, /נוסף למעקב/);
console.log('✔ קישור →', r1.split('\n')[0].replace(/<[^>]+>/g, ''));
while (pending.length) await pending.shift()();
const report = sent.find((m) => /המקומות הכי קרובים|אין מקומות|לא מצאתי/.test(m.text));
assert.ok(report, 'לא נשלח דוח');
assert.equal(report.to, '111');
assert.ok(report.buttons?.flat().some((b) => b.data?.startsWith('hot:')), 'אין כפתורים');
console.log('✔ דוח נשלח רק למבקש, עם כפתורים:', report.buttons.flat().map((b) => b.text).join(' | '));

const list = h.onList('111');
assert.match(list.text, /#1/);
assert.equal(h.onList('222').length > 0 && typeof h.onList('222') === 'string', true);
console.log('✔ /list אישי (משתמש אחר לא רואה את הרשימה)');

assert.match(h.onButton('hot', 1, '111'), /מעקב צפוף הופעל/);
console.log('✔ כפתור 🔥 → מעקב צפוף');
assert.match(h.onStatus(), /מצב הסוכן/);
console.log('✔ /status:\n' + h.onStatus().replace(/<[^>]+>/g, ''));
assert.match(h.onButton('stop', 1, '111'), /הוסר/);
console.log('✔ כפתור 🔕 → הוסר');

// handleUpdates עם הודעה מאדם לא מורשה – לא נכנס למעקב
await handleUpdates(cfg, [msg(1, process.argv[2])].map((u) => ({ ...u, message: { ...u.message, chat: { id: 999 } } })), h);
assert.equal(pending.length, 0);
console.log('✔ משתמש לא מורשה נחסם');
fs.rmSync('data/bot-flow', { recursive: true, force: true });
