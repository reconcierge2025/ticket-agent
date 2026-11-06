// בדיקת לילה מול האתרים האמיתיים (קריאה בלבד):
// לוקח מופע אחד מכל אתר, בודק שהסוכן עדיין קורא ממנו מושבים.
// אם משהו נשבר – יוצא עם שגיאה ושולח הודעה בטלגרם (אם מוגדר).
import { loadRuntimeConfig, resolveEvent } from '../src/config.js';
import { launchScanner } from '../src/browser.js';
import { checkEvent } from '../src/check.js';
import { discover } from '../src/discover.js';
import { sendTelegram, isConfigured } from '../src/telegram.js';

const cfg = loadRuntimeConfig('config.example.json');
const tg = cfg.telegram; // מוגדר רק כשיש TELEGRAM_BOT_TOKEN בסביבה
cfg.headless = true;
if (process.env.CI) cfg.browserChannel = '';
const db = { seen: {}, best: {}, history: [] };
const flat = (r) => (r.parts ? r.parts.flatMap(flat) : [r]);

const browser = await launchScanner(cfg);
const problems = [];
const ok = [];
try {
  const found = await discover(browser, { ...cfg, sites: cfg.sites.filter((s) => s.enabled !== false && !s.scoutOnly).map((s) => ({ ...s, maxPages: 3, maxEvents: 3 })) });
  for (const site of cfg.sites.filter((s) => s.enabled !== false && !s.scoutOnly)) {
    const events = found.filter((e) => e.name.startsWith(`${site.name}:`));
    if (!events.length) {
      problems.push(`${site.name}: לא נמצאו מופעים בעמוד הראשי`);
      continue;
    }
    let seats = 0;
    let lastErr = '';
    for (const ev of events) {
      try {
        const r = await checkEvent(browser, resolveEvent(cfg, { ...ev, discovered: false }), { cfg, db, notify: async () => {} });
        seats = flat(r).reduce((n, p) => n + (p.seats?.length || 0), 0);
        if (seats > 0) break;
      } catch (e) {
        lastErr = e.message.split('\n')[0];
      }
    }
    if (seats > 0) ok.push(`${site.name}: ${seats} מושבים`);
    else problems.push(`${site.name}: 0 מושבים ב-${events.length} מופעים${lastErr ? ` (${lastErr})` : ''}`);
  }
} finally {
  await browser.close();
}

console.log('✔', ok.join(' | ') || '—');
if (problems.length) {
  console.error('✖', problems.join('\n✖ '));
  if (isConfigured(tg)) {
    await sendTelegram(tg, `🧪⚠️ <b>בדיקת הלילה מצאה בעיה</b>\n\n${problems.map((p) => `• ${p}`).join('\n')}\n\nכנראה שאתר שינה מבנה – צריך לעדכן את הסוכן.`);
  }
  process.exit(1);
}
