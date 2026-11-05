// Ticketmaster ישראל.
// קישור אירוע:  https://www.ticketmaster.co.il/event/MTA71/ALL/iw        (יכולים להיות כמה תאריכים)
// קישור מופע:   https://www.ticketmaster.co.il/performance/MTA71/001/ALL/iw
//
// דף המופע טוען בעצמו getAllSelectableSeats = רשימת המושבים הפנויים:
//   { b: "HALE", r: "4", id: 45, s: "AVAILABLE", l: 2 }  → גוש / שורה / מושב / סטטוס / רמת מחיר
// HAL = אולם, BAL = יציע, BX = תא, GAL = גלריה. אות לטינית = אות עברית (E → ה').
//
// בחירה אוטומטית: לשונית "בחירה אוטומטית" של האתר → רמת מחיר → גוש → כמות → "לרכישה".
// האתר עצמו בוחר את המושבים הכי טובים בגוש שבחרנו (הגוש שבו מצאנו את המקומות הכי קרובים).
import { waitFor, captureJson, declineCookies } from './util.js';
import { proceedToCheckout } from './generic.js';

export const name = 'ticketmaster';
export const matches = (url) => /ticketmaster\.co\.il\/(event|performance)\//.test(url);
export const isListing = (url) => /ticketmaster\.co\.il\/event\//.test(url);

const HEB = 'אבגדהוזחטיכלמנסעפצקרשת';
const AREAS = [
  [/^HAL/i, 'אולם'],
  [/^BAL/i, 'יציע'],
  [/^GAL/i, 'גלריה'],
  [/^BX/i, 'תא'],
  [/^(FLR|FLOOR|ORC)/i, 'רחבה'],
];

/** HALE → "אולם ה'" · HAL8 → "אולם 8" · BX6A → "תא 6A" */
export function blockName(code) {
  for (const [re, he] of AREAS) {
    if (!re.test(code)) continue;
    const rest = code.replace(re, '');
    if (/^[A-Z]$/i.test(rest)) return `${he} ${HEB[rest.toUpperCase().charCodeAt(0) - 65]}'`;
    if (/^R$/i.test(rest) || rest === '') return he;
    return `${he} ${rest}`;
  }
  return code;
}

/** מדף אירוע – כל התאריכים: [{ url, label }] */
export async function listPerformances(page, event) {
  await declineCookies(page);
  const btns = () => page.getByText('לבחירת כרטיסים', { exact: true });
  await btns().first().waitFor({ timeout: 20000 }).catch(() => {});
  const count = Math.min(await btns().count(), 20);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (i > 0) {
      await page.goto(event.url, { waitUntil: 'domcontentloaded' });
      await declineCookies(page);
      await btns().nth(i).waitFor({ timeout: 20000 });
    }
    await btns().nth(i).click();
    await page.waitForURL(/\/performance\//, { timeout: 20000 }).catch(() => {});
    if (!/\/performance\//.test(page.url())) continue;
    const date = (await page.title()).match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || `מופע ${i + 1}`;
    out.push({ url: page.url(), label: date });
  }
  return [...new Map(out.map((p) => [p.url, p])).values()];
}

export function prepare(page) {
  return captureJson(page, { seats: /\/seatPlans\/getAllSelectableSeats\// });
}

export async function getSeats(page, event, data) {
  await declineCookies(page);
  await waitFor(() => data.seats, 40000);
  return (data.seats.data || []).map((d) => ({
    section: blockName(d.b),
    row: d.r,
    seat: d.id,
    available: d.s === 'AVAILABLE',
    price: null,
  }));
}

/** פותח רשימה נפתחת לפי הכותרת שלה ומחזיר את הטקסטים של האפשרויות. */
async function openDropdown(page, label) {
  // Angular Material: הכותרת (mat-label) לא לחיצה – לוחצים על ה-mat-select שבאותו שדה
  const field = page.locator('mat-form-field', { has: page.locator('mat-label', { hasText: label }) }).first();
  const select = field.locator('mat-select, .mat-select-trigger').first();
  await ((await select.count()) ? select : field).click({ timeout: 15000 });
  await page.waitForTimeout(800);
}

/**
 * בחירה אוטומטית עד עמוד התשלום. מחזיר { ok, note }.
 * dryRun=true → עוצר לפני "לרכישה" (לבדיקות – לא תופס מושבים).
 */
export async function autoSelect(page, best, event, opts = {}) {
  let step = 'פתיחת הדף';
  try {
    return await autoSelectSteps(page, best, event, opts, (s) => (step = s));
  } catch (e) {
    if (process.env.DEBUG_SHOTS) await page.screenshot({ path: `data/tm-fail.png` }).catch(() => {});
    return { ok: false, note: `נעצרתי בשלב "${step}": ${e.message.split('\n')[0]}` };
  }
}

async function autoSelectSteps(page, best, event, { dryRun = false }, at) {
  at('מפת המושבים');
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await declineCookies(page);
  await page.waitForTimeout(1000);
  await declineCookies(page);
  at('לשונית בחירה אוטומטית');
  await page.getByText('בחירה אוטומטית').first().click({ timeout: 15000 });
  await page.waitForTimeout(1500);

  const area = best.section.split(' ')[0]; // אולם / יציע / ...
  // רמות מחיר של האזור (רמה 1 קודם – בדרך כלל הקרובה ביותר)
  at('רשימת רמות מחיר');
  await openDropdown(page, 'סוג כרטיס');
  const levelRe = new RegExp(`^\\s*${area} רמה`);
  const option = (re) => page.locator('mat-option').filter({ hasText: re });
  const levels = [...new Set((await option(levelRe).allInnerTexts()).map((t) => t.trim().split(/\s+/).slice(0, 3).join(' ')))].sort();
  await page.keyboard.press('Escape');

  let chosen = null;
  for (const level of levels.length ? levels : [null]) {
    at(`בחירת ${level || 'גוש'}`);
    if (level) {
      await openDropdown(page, 'סוג כרטיס');
      await option(new RegExp(`^\\s*${level}`)).first().click({ timeout: 15000 });
      await page.waitForTimeout(800);
    }
    await openDropdown(page, 'אזור / גוש');
    await page.waitForTimeout(500);
    const block = page.locator('mat-option').filter({ hasText: new RegExp(`^\\s*${best.section}\\s*$`) });
    if (await block.count()) {
      await block.first().click({ timeout: 15000 });
      chosen = level || best.section;
      break;
    }
    await page.keyboard.press('Escape');
  }
  if (!chosen) return { ok: false, note: `לא מצאתי את ${best.section} בבחירה האוטומטית` };

  await page.waitForTimeout(1000);
  at('כמות כרטיסים');
  const add = page.locator('text=/^add$/').first();
  for (let i = 0; i < best.seats.length; i++) {
    await add.click();
    await page.waitForTimeout(300);
  }
  if (dryRun) return { ok: true, note: `נבחר: ${chosen} · ${best.section} · ${best.seats.length} כרטיסים (בדיקה – לא נלחץ "לרכישה")` };

  at('לרכישה');
  await page.getByText('לרכישה', { exact: true }).first().click();
  at('מעבר לתשלום');
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  const atCheckout = await proceedToCheckout(page, {
    generic: { continueText: 'המשך לתשלום|לתשלום|המשך|תשלום', checkoutUrlPattern: 'checkout|payment|/pay' },
  });
  const picked = await page.evaluate(() => document.body.innerText.match(/שורה\s*\S+[^\n]{0,40}/g)?.slice(0, 6).join(' | ') || '').catch(() => '');
  return { ok: atCheckout, note: picked ? `המושבים שהאתר נתן: ${picked}` : '' };
}
