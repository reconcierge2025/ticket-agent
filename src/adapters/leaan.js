// לאן (leaan.co.il) – מפת המושבים של vivenu.
// עמוד אמן:   https://www.leaan.co.il/category/<קטגוריה>/<אמן>   (כל התאריכים – כפתורי "להזמנת כרטיסים")
// עמוד תאריך: https://www.leaan.co.il/events/<שם>/<מספר>
import { declineCookies } from './util.js';
import { vivenuEventId, vivenuSeats } from './vivenu.js';

export const name = 'leaan';
export const matches = (url) => /leaan\.co\.il\/(events|category)\//.test(url);
export const isListing = (url, event = {}) => !event.expanded && /leaan\.co\.il\/category\//.test(url);

/** מעמוד אמן – כל התאריכים שלו (מסנן המלצות על אמנים אחרים באותו עמוד). */
export async function listPerformances(page, event) {
  await declineCookies(page);
  const artist = (await page.locator('h1').first().innerText().catch(() => '')).trim();
  const buttons = page.getByRole('button', { name: /^להזמנת כרטיסים, ל/ });
  await buttons.first().waitFor({ timeout: 20000 }).catch(() => {});
  const labels = await buttons.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || ''));
  const mine = labels.map((l, i) => ({ l, i })).filter((x) => !artist || x.l.includes(artist));
  const out = [];
  for (const { l, i } of mine.slice(0, 20)) {
    await page.goto(event.url, { waitUntil: 'domcontentloaded' });
    await declineCookies(page);
    const b = page.getByRole('button', { name: /^להזמנת כרטיסים, ל/ }).nth(i);
    await b.waitFor({ timeout: 20000 }).catch(() => {});
    await b.click().catch(() => {});
    await page.waitForURL(/leaan\.co\.il\/events\//, { timeout: 20000 }).catch(() => {});
    if (/\/events\//.test(page.url())) {
      const label = l.replace(/^להזמנת כרטיסים, ל[^,]*, שמתקיים ב, /, '').replace(/, ב,? /g, ' · ').slice(0, 70);
      out.push({ url: page.url(), label });
    }
  }
  return [...new Map(out.map((p) => [p.url, p])).values()];
}

export async function getSeats(page) {
  await declineCookies(page);
  const id = await vivenuEventId(page);
  if (!id) throw new Error('לא נמצאה מפת מושבים בעמוד (ייתכן שהמכירה סגורה או שזה אירוע בלי מקומות מסומנים)');
  return vivenuSeats(id);
}
