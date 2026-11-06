// סריקה כללית: עובר על עמודי האתרים שהגדרת ואוסף קישורים למופעים.
// לכל אתר: listUrl (עמוד פתיחה), eventLinkPattern (איך נראה קישור למופע),
// ואופציונלי pageLinkPattern (עמודי ביניים, למשל עמוד אמן שבו מופיעים התאריכים).
import { resolveEvent, log } from './config.js';

/** מזהה אירוע: בקופת ת"א – האתר + מספר המופע (features/441), אחרת הכתובת עצמה. */
export function eventKey(url) {
  const m = url.match(/^https?:\/\/([^/]+)\/booking\/features\/(\d+)/);
  return m ? `${m[1]}|${m[2]}` : url;
}

/** מידע על הדף כשלא נמצאו בו מופעים – כדי להבין אם האתר חוסם (למשל גלישה מחוץ לישראל). */
export const lastPageInfo = {};

async function linksOf(browser, url) {
  const page = await browser.newPage({ locale: 'he-IL' });
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500); // אתרים שטוענים את הרשימה ב-JavaScript
    lastPageInfo[url] = {
      status: res?.status(),
      title: (await page.title().catch(() => '')).slice(0, 60),
      textLength: await page.evaluate(() => document.body?.innerText?.length || 0).catch(() => 0),
    };
    const links = await page.$$eval('a[href]', (els) =>
      els.map((a) => ({ url: a.href.split('#')[0], text: (a.innerText || a.title || a.querySelector('img')?.alt || '').trim().replace(/\s+/g, ' ') }))
    );
    // שם האמן מהכותרת הראשית של העמוד (בעמוד אמן, הקישורים לתאריכים מכילים רק תאריך ואולם)
    links.heading = await page
      .evaluate(() => (document.querySelector('h1')?.innerText || '').trim().split('\n')[0])
      .catch(() => '');
    links.title = lastPageInfo[url].title;
    return links;
  } finally {
    await page.close();
  }
}

/** שם האמן מעמוד אמן: הכותרת הראשית, ואם אין – תחילת כותרת הדף ("שלמה ארצי הופעות - ..." → "שלמה ארצי"). */
export function artistOfPage(heading, title) {
  const h = String(heading || '').trim();
  if (h && h.length <= 60 && !/^(כרטיסים|הופעות|tickets?)\b/i.test(h)) return h;
  return String(title || '').split(/\s+הופעות|\s+כרטיסים|\s[|–-]\s/)[0].trim().slice(0, 60);
}

/**
 * דומיינים של אתרי כרטיסים אחרים שהסוכן נתקל בהם בדרך (קישורים החוצה) – מועמדים ל"אתר חדש".
 * דומיין → { from, sample }
 */
export const externalDomains = new Map();
const TICKETY = /ticket|tix|kupa|kupat|booking|event|show|concert|live|כרטיס|seat|box-?office/i;
const NOT_TICKET = /facebook|instagram|twitter|youtube|google|whatsapp|tiktok|apple|waze|linkedin|wikipedia|spotify|max\.co\.il|isracard|cal-store|leumi|elal|powercard|accessib|cookie|ketch|onetrust|gov\.il|business\./i;

function noteExternal(fromUrl, links) {
  let fromHost;
  try {
    fromHost = new URL(fromUrl).hostname.replace(/^www\./, '');
  } catch {
    return;
  }
  for (const l of links) {
    let host;
    try {
      host = new URL(l.url).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }
    if (!host || host === fromHost || host.endsWith('.' + fromHost) || NOT_TICKET.test(host)) continue;
    // רק דומיין שבעצמו נראה כמו אתר כרטיסים (לא כל קישור שיש בו "event")
    if (TICKETY.test(host) && !externalDomains.has(host)) externalDomains.set(host, { from: fromHost, sample: l.url });
  }
}

/** הסבר אנושי למה לא נמצאו מופעים בעמוד. */
export function explainEmpty(url) {
  const i = lastPageInfo[url];
  if (!i) return 'לא נמצאו מופעים בעמוד הראשי';
  const blocked = (i.status && i.status >= 400) || /denied|forbidden|blocked|just a moment|attention required|רק רגע/i.test(i.title) || i.textLength < 300;
  const info = `HTTP ${i.status ?? '?'} · "${i.title}" · ${i.textLength} תווים`;
  return blocked ? `האתר חסם את הגישה (${info}) – כנראה חוסם שרתים מחוץ לישראל` : `לא נמצאו מופעים בעמוד (${info})`;
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
      noteExternal(site.listUrl, top);
      // אותו קישור מופיע לפעמים כמה פעמים (תמונה בלי טקסט + כותרת) – לוקחים את הטקסט הארוך
      const keep = (url, text) => {
        if (!found.has(url) || (text || '').length > (found.get(url) || '').length) found.set(url, text || '');
      };
      for (const l of top) if (eventRe.test(l.url) && wanted(l)) keep(l.url, l.text);

      if (pageRe) {
        const byUrl = new Map();
        for (const l of top.filter((l) => pageRe.test(l.url) && l.url !== site.listUrl && wanted(l))) {
          if (!byUrl.has(l.url) || l.text.length > byUrl.get(l.url).text.length) byUrl.set(l.url, l);
        }
        for (const p of [...byUrl.values()].slice(0, site.maxPages ?? 30)) {
          try {
            const links = await linksOf(browser, p.url);
            noteExternal(p.url, links);
            const artist = artistOfPage(links.heading, links.title) || p.text;
            for (const l of links) {
              if (!eventRe.test(l.url)) continue;
              // קישור של האמן עצמו = רק תאריך/אולם ("27.11 שישי 13:00 ...") → מוסיפים את שם האמן.
              // קישור עם שם משלו (המלצה על מופע אחר באותו עמוד) – נשאר עם השם שלו.
              const dateOnly = !l.text || /^\d{1,2}[./]\d{1,2}/.test(l.text);
              if (dateOnly) found.set(l.url, [artist, l.text].filter(Boolean).join(' · '));
              else keep(l.url, l.text);
            }
          } catch (e) {
            log(`  ${site.name}: דילוג על ${p.url} (${e.message.split('\n')[0]})`);
          }
        }
      }

      // אירוע אחד = קישור אחד (כל התאריכים שלו נבדקים בכל מקרה)
      const byEvent = new Map();
      for (const [url, text] of found) if (!byEvent.has(eventKey(url))) byEvent.set(eventKey(url), [url, text]);
      // scoutOnly: אתר שמשמש רק למציאת אתרי כרטיסים חדשים (למשל אינדקס כמו טיקצ'אק LIVE)
      const list = site.scoutOnly ? [] : [...byEvent.values()].slice(0, site.maxEvents ?? 60);
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
