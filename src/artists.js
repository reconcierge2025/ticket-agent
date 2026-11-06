// רשימת אמנים מובילים: כשעולה (או כבר קיימת) הופעה של אחד מהם באחד האתרים – הסוכן מתריע.
// אפשר להוסיף/להסיר שמות כאן, או להוסיף אישית עם /follow.
// name = השם המוכר; he/en = כתיב נוסף (לזיהוי בשתי השפות – בנוסף לזיהוי לפי צליל).
import { matchesArtist, skeleton } from './translit.js';

export const STARS_IL = [
  'עומר אדם', 'אודיה', 'נועה קירל', 'עדן בן זקן', 'אייל גולן', 'שלמה ארצי', 'אביב גפן', 'עידן רייכל', 'ישי ריבו', 'חנן בן ארי',
  'סטטיק ובן אל', 'משה פרץ', 'רביד פלוטניק', 'עדן חסון', 'אושר כהן', 'ששון איפרם שאולוב', 'נתן גושן', 'ריטה', 'שרית חדד', 'אליעד',
  'אגם בוחבוט', 'מרגי', 'יובל דיין', 'נסרין קדרי', 'ליאור נרקיס', 'קובי פרץ', 'דודו אהרון', 'הראל סקעת', 'איתי לוי', 'אברהם טל',
  'אביתר בנאי', 'ברי סחרוף', 'הדג נחש', 'משינה', 'טיפקס', 'היהודים', 'אתניקס', 'שלום חנוך', 'מירי מסיקה', 'קרן פלס',
  'דודו טסה', 'שירי מימון', 'אנה זק', 'עמיר בניון', 'גידי גוב', 'מתי כספי', 'טונה', 'פלד', 'יהודית רביץ', 'מוש בן ארי',
].map((name) => ({ name, region: 'il' }));

/** מילים שאם מופיעות – זה לא האמן (Pink ≠ Pink Floyd, וגם לא מופעי מחווה). */
const NOT = {
  Pink: ['floyd', 'פלויד'],
  Muse: ['museum', 'מוזיאון'],
  Madonna: ['מדונה של'],
};
const TRIBUTE = /tribute|מחווה|מופע מחווה|cover band|להקת כיסוי/i;

export const STARS_WORLD = [
  ['Beyoncé', 'ביונסה'], ['Adele', 'אדל'], ['Ed Sheeran', 'אד שירן'], ['Tom Odell', 'טום אודל'], ['Coldplay', 'קולדפליי'],
  ['Taylor Swift', 'טיילור סוויפט'], ['The Weeknd', 'דה וויקנד'], ['Bruno Mars', 'ברונו מארס'], ['Dua Lipa', 'דואה ליפה'], ['Billie Eilish', 'בילי איליש'],
  ['Harry Styles', 'הארי סטיילס'], ['Drake', 'דרייק'], ['Rihanna', 'ריהאנה'], ['Lady Gaga', 'ליידי גאגא'], ['Bad Bunny', 'באד באני'],
  ['Post Malone', 'פוסט מאלון'], ['Imagine Dragons', 'אימג׳ין דרגונס'], ['Maroon 5', 'מארון 5'], ['Justin Bieber', 'ג׳סטין ביבר'], ['Ariana Grande', 'אריאנה גרנדה'],
  ['Olivia Rodrigo', 'אוליביה רודריגו'], ['Sabrina Carpenter', 'סברינה קרפנטר'], ['Shakira', 'שאקירה'], ['Metallica', 'מטאליקה'], ["Guns N' Roses", 'גאנז אנד רוזס'],
  ['Red Hot Chili Peppers', 'רד הוט צ׳ילי פפרס'], ['Foo Fighters', 'פו פייטרס'], ['Arctic Monkeys', 'ארקטיק מאנקיז'], ['Muse', 'מיוז'], ['U2', 'יו טו'],
  ['Bon Jovi', 'בון ג׳ובי'], ['Elton John', 'אלטון ג׳ון'], ['Paul McCartney', 'פול מקרטני'], ['The Rolling Stones', 'הרולינג סטונס'], ['Bruce Springsteen', 'ברוס ספרינגסטין'],
  ['Madonna', 'מדונה'], ['Pink', 'פינק'], ['Sia', 'סיה'], ['Lana Del Rey', 'לנה דל ריי'], ['Sam Smith', 'סם סמית׳'],
  ['Lewis Capaldi', 'לואיס קפלדי'], ['Hozier', 'הוזייר'], ['Kygo', 'קייגו'], ['David Guetta', 'דייוויד גואטה'], ['Calvin Harris', 'קלווין האריס'],
  ['Martin Garrix', 'מרטין גאריקס'], ['Andrea Bocelli', 'אנדראה בוצ׳לי'], ['Lenny Kravitz', 'לני קרביץ'], ['Robbie Williams', 'רובי וויליאמס'], ['Depeche Mode', 'דפש מוד'],
  ['Iron Maiden', 'איירון מיידן'], ['Linkin Park', 'לינקין פארק'], ['Oasis', 'אואזיס'], ['Celine Dion', 'סלין דיון'], ['Eminem', 'אמינם'],
].map(([name, he]) => ({ name, he, region: 'world', ...(NOT[name] ? { not: NOT[name] } : {}) }));

export const STARS = [...STARS_IL, ...STARS_WORLD];

const plainWords = (s) => ` ${String(s).toLowerCase().replace(/["'״׳’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

/** האם שם המופע הוא של האמן: כתיב מדויק (כמילה שלמה) או – לשמות לא קצרים – לפי צליל. */
export function starMatches(star, eventName) {
  const ev = plainWords(eventName);
  if (TRIBUTE.test(eventName)) return false; // מופע מחווה/כיסוי – לא האמן עצמו
  if ((star.not || []).some((w) => ev.includes(plainWords(w)))) return false;
  for (const alias of [star.name, star.he, star.en].filter(Boolean)) {
    if (ev.includes(plainWords(alias))) return true;
    // שמות קצרים (Adele, Sia, U2) – רק כתיב מדויק, אחרת יותר מדי התאמות שגויות
    const len = String(alias).split(/\s+/).map(skeleton).join('').length;
    if (len >= 4 && matchesArtist(alias, eventName)) return true;
  }
  return false;
}

/** האמן המוביל שהמופע שלו (או null). */
export const starFor = (eventName, list = STARS) => list.find((s) => starMatches(s, eventName)) || null;

export function starsText() {
  return [
    `⭐ <b>אמנים מובילים שאני עוקב אחריהם אוטומטית (${STARS.length})</b>`,
    'כשיש הופעה של אחד מהם באחד האתרים – קיימת או חדשה – אשלח לך הודעה (פעם אחת לכל מופע).',
    '',
    `🇮🇱 <b>ישראל (${STARS_IL.length}):</b>`,
    STARS_IL.map((s) => s.name).join(' · '),
    '',
    `🌍 <b>בעולם (${STARS_WORLD.length}):</b>`,
    STARS_WORLD.map((s) => s.name).join(' · '),
    '',
    '➕ אמן שלא ברשימה: <code>עקוב אחרי שם האמן</code>',
  ].join('\n');
}
