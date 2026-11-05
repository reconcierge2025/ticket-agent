// סריקה כללית: עובר על עמודי האתרים שהגדרת ואוסף קישורים למופעים.
// לכל אתר: listUrl (עמוד פתיחה), eventLinkPattern (איך נראה קישור למופע),
// ואופציונלי pageLinkPattern (עמודי ביניים, למשל עמוד אמן שבו מופיעים התאריכים).
import { resolveEvent, log } from './config.js';

/** מזהה אירוע: בקופת ת"א – האתר + מספר המופע (features/441), אחרת הכתובת עצמה. */
export function eventKey(url) {
  const m = url.match(/^https?:\/\/([^/]+)\/booking\/features\/(\d+)/);
  return m ? `${m[1]}|${m[2]}` : url;
}

async function linksOf(browser, url) {
  const page = await browser.newPage({ locale: 'he-IL' });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500); // אתרים שטוענים את הרשימה ב-JavaScript
    return await page.$$eval('a[href]', (els) =>
      els.map((a) => ({ url: a.href.split('#')[0], text: (a.innerText || a.title || '').trim().replace(/\s+/g, ' ') }))
    );
  } finally {
    await page.close();
  }
}

export async function discover(browser, cfg) {
  const events = [];
  for (const site of (cfg.sites || []).filter((s) => s.listUrl && s.enabled !== false)) {
    try {
      const eventRe = new RegExp(site.eventLinkPattern);
      const pageRe = site.pageLinkPattern ? new RegExp(site.pageLinkPattern) : null;
      const kw = (site.keywords || []).map((k) => k.toLowerCase());
      const wanted = (l) => !kw.length || kw.some((k) => l.text.toLowerCase().includes(k) || l.url.toLowerCase().includes(k));

      const found = new Map();
      const top = await linksOf(browser, site.listUrl);
      for (const l of top) if (eventRe.test(l.url) && wanted(l)) found.set(l.url, l.text);

      if (pageRe) {
        const pages = [...new Map(top.filter((l) => pageRe.test(l.url) && l.url !== site.listUrl && wanted(l)).map((l) => [l.url, l])).values()];
        for (const p of pages.slice(0, site.maxPages ?? 30)) {
          try {
            for (const l of await linksOf(browser, p.url)) {
              if (eventRe.test(l.url) && !found.has(l.url)) found.set(l.url, `${p.text || ''} ${l.text}`.trim());
            }
          } catch (e) {
            log(`  ${site.name}: דילוג על ${p.url} (${e.message.split('\n')[0]})`);
          }
        }
      }

      // אירוע אחד = קישור אחד (כל התאריכים שלו נבדקים בכל מקרה)
      const byEvent = new Map();
      for (const [url, text] of found) if (!byEvent.has(eventKey(url))) byEvent.set(eventKey(url), [url, text]);
      const list = [...byEvent.values()].slice(0, site.maxEvents ?? 60);
      for (const [url, text] of list) {
        events.push(resolveEvent(cfg, { name: `${site.name}: ${text || url}`.slice(0, 120), url, discovered: true }));
      }
      log(`  ${site.name}: נמצאו ${list.length} מופעים`);
    } catch (e) {
      log(`  שגיאה בסריקת ${site.name}: ${e.message.split('\n')[0]}`);
    }
  }
  return events;
}
