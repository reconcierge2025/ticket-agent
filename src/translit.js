// זיהוי שם אמן בעברית ובאנגלית לפי הצליל: "שלמה ארצי" = "Shlomo Artzi", "עומר אדם" = "Omer Adam".
// כל מילה הופכת ל"שלד" של עיצורים לפי קבוצות צליל (ב/v/w → B, כ/ק/ח/c/k/ch/h → K, ש/ס/s/sh → S ...),
// בלי תנועות ובלי אותיות שקטות (א, ע, ה, י, ו באמצע מילה). שני שמות תואמים אם השלדים שלהם תואמים.

const HEB = {
  ב: 'B', ג: 'G', ד: 'D', ז: 'Z', ח: 'K', ט: 'T', כ: 'K', ך: 'K', ל: 'L', מ: 'M', ם: 'M', נ: 'N', ן: 'N',
  ס: 'S', פ: 'P', ף: 'P', צ: 'C', ץ: 'C', ק: 'K', ר: 'R', ש: 'S', ת: 'T',
  א: '', ע: '', ה: '', י: '',
};

function hebrewSkeleton(w) {
  let out = '';
  [...w].forEach((ch, i) => {
    if (ch === 'ו') out += i === 0 ? 'B' : ''; // ו בתחילת מילה = v, אחרת תנועה
    else if (ch in HEB) out += HEB[ch];
  });
  return out;
}

function latinSkeleton(w) {
  let s = w.toLowerCase().replace(/[^a-z]/g, '');
  s = s
    .replace(/ph/g, 'P')
    .replace(/sh|sch/g, 'S')
    .replace(/(ts|tz|tc)/g, 'C')
    .replace(/(ch|kh|ck|q|k)/g, 'K')
    .replace(/c(?=[eiy])/g, 'S')
    .replace(/c/g, 'K')
    .replace(/th/g, 'T')
    .replace(/x/g, 'KS')
    .replace(/[vwb]/g, 'B')
    .replace(/f/g, 'P')
    .replace(/j/g, 'G')
    .replace(/h/g, 'K')
    .replace(/[aeiouy]/g, '')
    .replace(/([a-z])/g, (m) => m.toUpperCase());
  return s.replace(/(.)\1+/g, '$1'); // אותיות כפולות (Ribbo → Ribo)
}

/** שלד הצליל של מילה (עברית או אנגלית). */
export function skeleton(word) {
  const w = String(word).replace(/[֑-ׇ'"׳״`-]/g, ''); // ניקוד, גרש, מירכאות
  return /[א-ת]/.test(w) ? hebrewSkeleton(w).replace(/(.)\1+/g, '$1') : latinSkeleton(w);
}

const words = (s) => String(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const keys = (s) => words(s).map(skeleton).filter(Boolean);

/** מרחק עריכה קטן (לסבול הבדל של אות אחת: Hadag/הדג). */
function dist(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// התאמה של מילה: זהה; או זהה בלי K בהתחלה (h באנגלית מול ה שקטה: Hadag/הדג);
// או – רק במילים ארוכות (4+ עיצורים) – הבדל של אות אחת. מילים קצרות חייבות להיות זהות.
const close = (a, b) => a === b || a.replace(/^K/, '') === b.replace(/^K/, '') || (Math.min(a.length, b.length) >= 4 && dist(a, b) <= 1);

const plain = (s) => String(s).toLowerCase().replace(/["'״׳]/g, '').replace(/\s+/g, ' ').trim();

/**
 * האם שם המופע מתאים לאמן שעוקבים אחריו – לפי טקסט, ואם לא, לפי צליל (עברית ↔ אנגלית).
 * כל מילות האמן צריכות להופיע ברצף בשם המופע.
 */
export function matchesArtist(artist, eventName) {
  if (plain(eventName).includes(plain(artist))) return true;
  const a = keys(artist);
  if (!a.length || a.join('').length < 2) return false;
  // שם קצר (Rita = RT) – רק התאמה מדויקת של הצליל
  const same = a.join('').length < 4 ? (x, y) => x === y : close;
  // שם של מילה אחת – רק כשהשלד ארוך מספיק כדי לא לתפוס מילים מקריות
  if (a.length === 1 && a[0].length < 2) return false;
  const e = keys(eventName);
  for (let i = 0; i + a.length <= e.length; i++) if (a.every((k, j) => same(k, e[i + j]))) return true;
  return false;
}
