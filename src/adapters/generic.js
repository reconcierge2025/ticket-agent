// מתאם כללי: קורא מושבים ממפת האולם, בוחר אותם וממשיך עד עמוד התשלום.
// לכל אתר אפשר להוסיף מתאם ייעודי בתיקייה הזו (למשל eventim.js) עם אותן פונקציות.

export const name = 'generic';
export const matches = () => false;

export async function getSeats(page, event) {
  const g = event.generic || {};
  if (g.quantitySelector && event.quantity) {
    await page.selectOption(g.quantitySelector, String(event.quantity)).catch(() => {});
  }
  if (g.waitForSelector) await page.waitForSelector(g.waitForSelector, { timeout: 30000 });
  return page.$$eval(
    g.seatSelector || '[data-seat]',
    (els, g) =>
      els.map((el, i) => {
        el.setAttribute('data-agent-id', String(i)); // כדי שנוכל ללחוץ בדיוק על המושב הזה אחר כך
        const attr = (name) => (name ? el.getAttribute(name) ?? el.closest(`[${name}]`)?.getAttribute(name) : null);
        return {
          id: i,
          section: attr(g.sectionAttr || 'data-section'),
          row: attr(g.rowAttr || 'data-row'),
          seat: attr(g.seatAttr || 'data-seat'),
          price: g.priceAttr ? Number(attr(g.priceAttr)) || null : null,
          available: g.availableSelector ? el.matches(g.availableSelector) : true,
        };
      }),
    g
  );
}

export async function selectSeats(page, block) {
  for (const s of block.items) {
    await page.click(`[data-agent-id="${s.id}"]`);
    await page.waitForTimeout(300);
  }
}

/** לוחץ "המשך"/"לתשלום" עד שמגיעים לעמוד התשלום. לא ממלא שום פרטי תשלום. */
export async function proceedToCheckout(page, event) {
  const g = event.generic || {};
  const checkoutUrl = new RegExp(g.checkoutUrlPattern || 'checkout|payment|/pay', 'i');
  const checkoutText = new RegExp(g.checkoutText || 'פרטי תשלום|אמצעי תשלום|פרטי כרטיס|payment details', 'i');
  const cont = new RegExp(g.continueText || 'המשך|לתשלום|הוסף לסל|לרכישה|הזמן|continue|checkout|proceed', 'i');

  for (let step = 0; step < 8; step++) {
    if (checkoutUrl.test(page.url())) return true;
    const body = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    if (checkoutText.test(body)) return true;

    const btn = page.getByRole('button', { name: cont }).or(page.getByRole('link', { name: cont })).first();
    if (await btn.count()) {
      await btn.click();
      await page.waitForLoadState('domcontentloaded').catch(() => {});
    }
    await page.waitForTimeout(1500);
  }
  return false;
}
