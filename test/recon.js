// סקירה של אתרי כרטיסים (קריאה בלבד): האם הסוכן מגיע לאתר, האם הוא נחסם, ואילו קישורי מופעים יש בו.
// הרצה: node test/recon.js [domain...]   → שומר ל-data/recon.json
import fs from 'node:fs';
import { chromium } from 'playwright';

const SITES = (process.argv.slice(2).length ? process.argv.slice(2) : [
  'ticketmaster.com', 'livenation.com', 'axs.com', 'eventbrite.com', 'dice.fm', 'ticketweb.com', 'etix.com', 'showclix.com', 'tix.com', 'seetickets.us',
  'eventim.com', 'ticketmaster.co.uk', 'seetickets.com', 'gigsandtours.com', 'fnacspectacles.com', 'skiddle.com', 'ticketline.co.uk', 'gigantic.com', 'wegow.com', 'billetweb.fr',
  'ents24.com', 'oeticket.com', 'ticketcorner.ch', 'billetlugen.dk', 'myticket.co.uk',
  'ticketmaster.co.il', 'eventim.co.il', 'leaan.co.il', '2207.co.il', 'zappa-club.co.il', 'tomix.co.il', 'eventer.co.il', 'get-in.com', 'bravo.org.il', 'tickchak.co.il',
  'goshow.co.il', 'megatickets.co.il', 'livetickets.co.il', 'ticketplace.co.il', 'ticket-house.com',
  'stubhub.com', 'viagogo.com', 'seatgeek.com', 'tickpick.com', 'vividseats.com', 'ticketswap.com', 'twickets.live', 'gametime.co', 'ticketnetwork.com', 'songkick.com',
]);

const BLOCK = /access denied|attention required|verify you are human|are you a robot|captcha|pardon our interruption|request unsuccessful|blocked|forbidden|incapsula|just a moment|unusual traffic|bot/i;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1366, height: 800 } });
const out = [];
for (const domain of SITES) {
  const page = await ctx.newPage();
  const r = { domain };
  try {
    const res = await page.goto(`https://${domain}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3500);
    r.status = res?.status();
    r.finalUrl = page.url();
    r.title = (await page.title()).slice(0, 80);
    const text = await page.evaluate(() => document.body?.innerText?.slice(0, 3000) || '');
    r.blocked = (r.status >= 400 && r.status !== 404) || (BLOCK.test(r.title) || (text.length < 400 && BLOCK.test(text)));
    const links = await page.$$eval('a[href]', (els) => [...new Set(els.map((a) => a.href))]);
    r.links = links.length;
    r.eventLinks = links.filter((h) => /event|show|perform|concert|tickets?\/|booking|\/e\/|artist|הופע/i.test(h)).slice(0, 6);
  } catch (e) {
    r.error = e.message.split('\n')[0].slice(0, 120);
  }
  console.log(`${r.blocked ? '⛔' : r.error ? '❌' : '✅'} ${domain} · ${r.status ?? ''} · ${r.title ?? r.error ?? ''}`);
  out.push(r);
  await page.close();
  await new Promise((res) => setTimeout(res, 1000));
}
await browser.close();
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/recon.json', JSON.stringify(out, null, 2));
