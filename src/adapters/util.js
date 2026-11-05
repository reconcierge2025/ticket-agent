// כלים משותפים למתאמים.

/** מחכה עד שהתנאי מתקיים (או זורק אחרי timeout). */
export async function waitFor(cond, timeout = 30000, what = 'נתוני מושבים') {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`לא התקבלו ${what} תוך ${timeout / 1000} שניות`);
}

/**
 * מאזין לתשובות שהדף עצמו מקבל מהשרת (כמו דפדפן רגיל – בלי בקשות נוספות)
 * ושומר את ה-JSON לפי כללים: { key: /regex של כתובת/ }.
 */
export function captureJson(page, rules) {
  const data = {};
  page.on('response', async (res) => {
    const url = res.url();
    const key = Object.keys(rules).find((k) => rules[k].test(url));
    if (!key || !res.ok()) return;
    try {
      data[key] = await res.json();
    } catch {}
  });
  return data;
}

/** דוחה באנר עוגיות אם מופיע (האפשרות השומרת על פרטיות). */
export async function declineCookies(page) {
  const btn = page.getByRole('button', { name: /דחיית הכול|דחה הכל|Reject all/i }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {});
}
