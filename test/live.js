// בדיקה מול האתרים האמיתיים – רק קריאה, בלי טלגרם ובלי קנייה.
// הרצה: node test/live.js <קישור> [<קישור> ...]
//       DRY_SELECT=1 → גם בחירה אוטומטית ב-Ticketmaster עד לפני "לרכישה" (לא תופס מושבים)
import { loadConfig, resolveEvent } from '../src/config.js';
import { launchScanner } from '../src/browser.js';
import { checkEvent, describe, pickTarget, pickAdapter } from '../src/check.js';
import { formatReport } from '../src/telegram.js';

const cfg = { ...loadConfig('config.example.json'), telegram: {} };
const db = { seen: {}, best: {}, history: [] };
const browser = await launchScanner(cfg);
const flat = (r) => (r.parts ? r.parts.flatMap(flat) : [r]);
const strip = (t) => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');

for (const url of process.argv.slice(2)) {
  const t = Date.now();
  try {
    const r = await checkEvent(browser, resolveEvent(cfg, { url }), { cfg, db, notify: async (m) => console.log('[notify]', strip(m)) });
    for (const p of flat(r)) {
      const free = p.seats?.filter((s) => s.available).length;
      console.log(`\n== ${p.event.date || ''} ${p.event.url}\n   ${p.status} · ${p.seats?.length ?? 0} מושבים · ${free ?? 0} פנויים · ${((Date.now() - t) / 1000).toFixed(1)}s`);
      console.log('--- הודעה ---\n' + strip(formatReport(p.event, p.options)));

      if (process.env.DRY_SELECT && /ticketmaster/.test(p.event.url) && p.options.length) {
        const best = pickTarget(p.options.filter((o) => o.quantity === 2));
        const adapter = await pickAdapter(p.event);
        const page = await browser.newPage({ locale: 'he-IL' });
        await page.goto(p.event.url, { waitUntil: 'domcontentloaded' });
        const res = await adapter.autoSelect(page, best, p.event, { dryRun: true }).catch((e) => ({ ok: false, note: e.message.split('\n')[0] }));
        console.log(`--- בחירה אוטומטית (בדיקה) עבור ${describe(best)}:`, res);
        await page.close();
      }
    }
  } catch (e) {
    console.log(`\n== ${url}\n   ERROR: ${e.message.split('\n')[0]}`);
  }
}
await browser.close();
