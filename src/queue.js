// המתנה בתור וירטואלי (Queue-it וכדומה) כמו מבקר רגיל – בלי לעקוף את התור ובלי לפתור CAPTCHA.
// שולח התראות כשהתור מתקדם, כשמופיע CAPTCHA (שצריך לפתור בעצמך), וכשהתור נגמר.

const DEFAULT_URL = 'queue-it\\.net|/queue|waitingroom|waiting-room';
const DEFAULT_TEXT = 'חדר המתנה|חדר ההמתנה|הנך בתור|מקומך בתור|המיקום שלך בתור|you are (now )?in line|waiting room';
const CAPTCHA = 'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare"], #challenge-form';

export async function inQueue(page, q = {}) {
  if (new RegExp(q.urlPattern || DEFAULT_URL, 'i').test(page.url())) return true;
  const text = await page.evaluate(() => document.body?.innerText?.slice(0, 5000) || '').catch(() => '');
  return new RegExp(q.textPattern || DEFAULT_TEXT, 'i').test(text);
}

/** מחלץ מיקום בתור וזמן משוער מטקסט הדף. */
export function parseQueueText(text) {
  const pos = text.match(/(?:מיקומך|מקומך|המיקום שלך|מספרך|position|number in line)[^\d]{0,40}([\d,]+)/i);
  const eta = text.match(/(\d+)\s*(?:דקות|דק'|minutes|min)/i);
  return {
    position: pos ? Number(pos[1].replace(/,/g, '')) : null,
    etaMinutes: eta ? Number(eta[1]) : null,
  };
}

export async function waitThroughQueue(page, q = {}, notify, label) {
  if (!(await inQueue(page, q))) return false;
  const thresholds = [...(q.notifyAtPositions || [1000, 300, 50])].sort((a, b) => b - a);
  const sent = new Set();
  let captchaWarned = false;
  let etaWarned = false;
  const deadline = Date.now() + (q.maxHours ?? 6) * 3600_000;

  await notify(`⏳ נכנסתי לתור: ${label}\nאני מחכה ואעדכן כשהתור מתקרב.`);
  while (Date.now() < deadline) {
    await page.waitForTimeout((q.pollSeconds ?? 10) * 1000);

    const captcha = await page.locator(CAPTCHA).count().catch(() => 0);
    if (captcha && !captchaWarned) {
      captchaWarned = true;
      await notify(`🤖 יש בדיקת "אני לא רובוט" ב-${label}.\nצריך לפתור אותה בעצמך בחלון הפתוח במחשב.`);
    }
    if (!captcha) captchaWarned = false;

    if (!(await inQueue(page, q))) {
      await notify(`🚪 התור נגמר – נכנסתי לאתר! ${label}\nמחפש עכשיו מקומות...`);
      return true;
    }

    const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    const { position, etaMinutes } = parseQueueText(text);
    for (const t of thresholds) {
      if (position !== null && position <= t && !sent.has(t)) {
        sent.add(t);
        await notify(`🔔 התור מתקרב: מקום ${position} בתור – ${label}`);
        break;
      }
    }
    if (etaMinutes !== null && etaMinutes <= (q.notifyEtaMinutes ?? 5) && !etaWarned) {
      etaWarned = true;
      await notify(`⏰ עוד כ-${etaMinutes} דקות תורך! ${label}\nכדאי להתקרב למחשב.`);
    }
  }
  await notify(`⚠️ חיכיתי בתור יותר מדי זמן ועצרתי: ${label}`);
  return false;
}
