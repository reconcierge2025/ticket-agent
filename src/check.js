// שני מצבי עבודה על אירוע:
// checkEvent – סריקה שקטה (כל שעה): המקומות הכי קרובים בכל אזור, לכל כמות (2–5), ושומר "שיא".
// runLive    – מצב קנייה: חלון גלוי עם ההתחברות שלך, מחכה בתור, מוצא מקומות ומביא אותך אליהם.
import { findBestOptions, rowNum } from './seats.js';
import { updateBest, once, save } from './storage.js';
import { inQueue, waitThroughQueue } from './queue.js';
import { getBuyContext } from './browser.js';
import { log } from './config.js';

const SITE_ADAPTERS = ['kupat', 'ticketmaster'];

export async function pickAdapter(event) {
  if (event.site && !['auto', 'generic'].includes(event.site)) return import(`./adapters/${event.site}.js`);
  for (const name of SITE_ADAPTERS) {
    const mod = await import(`./adapters/${name}.js`);
    if (mod.matches(event.url)) return mod;
  }
  return import('./adapters/generic.js');
}

export async function checkEvent(browser, event, ctx) {
  const { cfg, db, notify } = ctx;
  const adapter = await pickAdapter(event);
  const page = await browser.newPage({ locale: 'he-IL' });
  let closed = false;
  try {
    const data = adapter.prepare?.(page) || {};
    await page.goto(event.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    event = await withSiteName(page, event);

    if (await inQueue(page, cfg.queue)) {
      if (once(db, `queue|${event.url}|${new Date().toDateString()}`)) {
        await notify(`⏳ <b>יש עכשיו תור באתר</b>\n${esc(event.name)}\n\nכדי שאחכה בתור בשבילך ואתפוס מקומות, שלח:\n<code>/sale ${esc(event.url)} ${event.quantity || 2}</code>`);
      }
      return { event, status: 'queue', options: [], improved: [] };
    }

    // אירוע עם כמה תאריכים → בודקים כל תאריך בנפרד
    if (adapter.isListing?.(event.url, event)) {
      const perfs = await adapter.listPerformances(page, event, data);
      await page.close();
      closed = true;
      log(`  ${event.name}: ${perfs.length} תאריכים`);
      const all = [];
      for (const p of perfs) {
        try {
          const name = p.name && /^[\w.-]+\.[a-z]{2,}\//i.test(event.name) ? p.name : event.name;
          all.push(await checkEvent(browser, { ...event, name, url: p.url, expanded: true, date: p.label }, ctx));
        } catch (e) {
          log(`  שגיאה ב-${p.label}: ${e.message.split('\n')[0]}`);
        }
      }
      return { event, status: 'multi', parts: all, options: all.flatMap((r) => r.options), improved: all.flatMap((r) => r.improved) };
    }

    const seats = await adapter.getSeats(page, event, data);
    const options = findBestOptions(seats, event);
    const improved = updateBest(db, event, options);
    return { event, status: options.length ? 'found' : 'none', seats, options, improved };
  } finally {
    if (!closed) await page.close().catch(() => {});
  }
}

/** תיאור קצר של אפשרות: "אולם 5 · שורה 2 · מושבים 7–8 · 329 ₪" */
export function describe(o) {
  const seats = o.seats.length > 2 ? `${o.seats[0]}–${o.seats[o.seats.length - 1]}` : o.seats.join(', ');
  const price = o.prices?.find(Boolean) ? ` · ${o.prices.find(Boolean)} ₪` : '';
  return `${o.section} · שורה ${o.row} · מושבים ${seats}${price}`;
}

export async function runLive(event, { cfg, db, notify }) {
  const adapter = await pickAdapter(event);
  const context = await getBuyContext(cfg);
  const page = await context.newPage();
  const data = adapter.prepare?.(page) || {};
  await page.goto(event.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.bringToFront();

  if (await inQueue(page, cfg.queue)) {
    const ok = await waitThroughQueue(page, cfg.queue, notify, event.name);
    if (!ok) return { status: 'queue-failed', page };
    await page.waitForLoadState('domcontentloaded').catch(() => {});
  }
  // במצב קנייה עובדים על התאריך שבקישור (ב-Ticketmaster: קישור אירוע → התאריך הראשון)
  if (adapter.isListing?.(page.url(), { ...event, expanded: true })) {
    const [first] = await adapter.listPerformances(page, event, data);
    if (first && page.url() !== first.url) await page.goto(first.url, { waitUntil: 'domcontentloaded' });
  }

  const want = event.quantity || 2;
  const deadline = Date.now() + (event.liveMinutes ?? 30) * 60000;
  let options = [];
  while (Date.now() < deadline) {
    try {
      options = findBestOptions(await adapter.getSeats(page, event, data), { ...event, quantities: [want] });
    } catch (e) {
      log(`  [live] עדיין אין מושבים: ${e.message.split('\n')[0]}`);
    }
    if (options.length) break;
    await page.waitForTimeout((event.refreshSeconds ?? 20) * 1000);
    if (!(await inQueue(page, cfg.queue))) {
      for (const k of Object.keys(data)) delete data[k];
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    }
  }

  if (!options.length) {
    await notify(`😕 <b>לא נמצאו ${want} מקומות צמודים</b>\n${esc(event.name)}\nחיפשתי ${event.liveMinutes ?? 30} דקות. החלון נשאר פתוח במחשב.`);
    return { status: 'none', page };
  }
  updateBest(db, event, options);
  save(db);

  const best = pickTarget(options); // הכי קרוב לבמה, ובשוויון – לפי סדר האזורים שלך
  const list = options.map((o) => `▫️ ${esc(o.zone)}: ${esc(describe(o))}`).join('\n');
  await page.bringToFront();

  if (event.autoSelect && adapter.autoSelect) {
    const r = await adapter.autoSelect(page, best, event);
    await notify(
      r.ok
        ? `🛒🚨 <b>המקומות בסל – גש לשלם עכשיו!</b>\n${esc(event.name)}\n\n🎯 ${esc(best.section)} · שורה ${esc(best.row)} · ${want} כרטיסים\n${esc(r.note || '')}\n\nהחלון במחשב פתוח על עמוד התשלום, ואתה מחובר.\n⏱️ ההזמנה שמורה רק כמה דקות!`
        : `⚠️ <b>לא הצלחתי להשלים לבד – המשך ידנית בחלון, מהר!</b>\n${esc(event.name)}\n${esc(r.note || '')}\n\nהמקומות הטובים שמצאתי:\n${list}`
    );
    return { status: r.ok ? 'checkout' : 'selected', page, options, best };
  }

  if (event.autoSelect && adapter.selectSeats) {
    await adapter.selectSeats(page, best, event);
    const atCheckout = await adapter.proceedToCheckout(page, event);
    await notify(
      atCheckout
        ? `🛒🚨 המקומות בסל! ${best.zone} · ${describe(best)}\nהגעתי לעמוד התשלום בחלון שבמחשב – גש ושלם עכשיו. ההזמנה שמורה רק כמה דקות!`
        : `⚠️ בחרתי ${best.zone} · ${describe(best)} אבל לא הגעתי לבד לעמוד התשלום. המשך ידנית בחלון – מהר!`
    );
    return { status: atCheckout ? 'checkout' : 'selected', page, options, best };
  }

  // קופת ת"א: המפה היא תמונה – החלון פתוח על המופע ואתה לוחץ על המושבים
  await notify(
    `🚨 <b>גש למחשב עכשיו!</b>\n${esc(event.name)}\n\nהחלון פתוח על מפת המושבים ואתה מחובר.\nלחץ על ${want} המושבים האלה ואז "המשך":\n\n🎯 <b>${esc(best.section)} · שורה ${esc(best.row)} · מושבים ${best.seats.join(', ')}</b>\n\nאפשרויות נוספות:\n${list}`
  );
  return { status: 'ready', page, options, best };
}

/** אם לאירוע אין שם (רק כתובת) – לוקח את שם המופע מכותרת הדף. */
async function withSiteName(page, event) {
  if (!/^[\w.-]+\.[a-z]{2,}\//i.test(event.name)) return event;
  const title = (await page.title().catch(() => '')).split(/ כרטיסים|\s[|–-]\s/)[0].trim();
  return title && !/^(קופת|ticketmaster)/i.test(title) ? { ...event, name: title } : event;
}

/** האפשרות הכי קרובה לבמה (שורה נמוכה), ובשוויון – לפי סדר האזורים ב-config. */
export function pickTarget(options) {
  return [...options].sort((a, b) => rowNum(a.row) - rowNum(b.row))[0];
}

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const targetRowOf = (event) => event.targetRow ?? 4;
export const maxRowOf = targetRowOf;
