// סימולציה של /follow בכמה צורות כתיבה (בלי טלגרם אמיתי). הרצה: node test/follow-flow.js
import fs from 'node:fs';
process.env.AGENT_DATA_DIR = 'data/follow-flow';
fs.rmSync('data/follow-flow', { recursive: true, force: true });
const { handleUpdates } = await import('../src/bot.js');
const { createAgent } = await import('../src/core.js');
const { loadConfig } = await import('../src/config.js');

const cfg = { ...loadConfig('config.example.json'), telegram: { botToken: 'PUT_', chatIds: ['111'] } };
const db = { seen: {}, best: {}, history: [] };
const agent = createAgent({ cfg, db, notify: async () => {} });
const h = agent.handlers([]);
let id = 1;
const say = async (text) => {
  console.log(`\n>>> ${text}`);
  await handleUpdates(cfg, [{ update_id: id++, message: { chat: { id: 111 }, from: { first_name: 't' }, text } }], h);
};
for (const t of ['/follow שלמה ארצי', '/follow', 'עומר אדם', '/follow@ticket_bot עדן חסון', 'עקוב אחרי נועה קירל', '/follows']) await say(t);
console.log('\nנשמר:', JSON.stringify(db.follows?.map((f) => f.kw)));
fs.rmSync('data/follow-flow', { recursive: true, force: true });
