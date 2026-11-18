// Minimal parser for common OpenStreetMap opening_hours values, e.g.
//   "24/7" | "08:00-17:00" | "Mo-Fr 08:30-16:30; Sa,Su 09:00-18:00" | "Tu-Su 09:00-16:00; Mo off"
// Anything it does not understand returns null ("unknown") — never guessed.
export type Range = [number, number]; // minutes from 00:00, end may exceed 1440 (overnight)
export type WeekHours = Range[][]; // index 0 = Monday ... 6 = Sunday

const DAY = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
const TH_DAY = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];

function parseDays(spec: string): number[] | null {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const p = part.trim().toLowerCase();
    if (p === 'ph' || p === 'sh') continue; // public/school holidays: ignored
    const m = /^([a-z]{2})(?:-([a-z]{2}))?$/.exec(p);
    if (!m) return null;
    const a = DAY.indexOf(m[1]);
    const b = m[2] ? DAY.indexOf(m[2]) : a;
    if (a < 0 || b < 0) return null;
    for (let i = a; ; i = (i + 1) % 7) {
      out.add(i);
      if (i === b) break;
    }
  }
  return [...out];
}

function parseTimes(spec: string): Range[] | null {
  const out: Range[] = [];
  for (const part of spec.split(',')) {
    const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(part.trim());
    if (!m) return null;
    const s = Number(m[1]) * 60 + Number(m[2]);
    let e = Number(m[3]) * 60 + Number(m[4]);
    if (e <= s) e += 1440;
    out.push([s, e]);
  }
  return out;
}

export function parseOpeningHours(text: string | null | undefined): WeekHours | null {
  if (!text) return null;
  const t = text.trim();
  if (!t) return null;
  if (t === '24/7') return Array.from({ length: 7 }, () => [[0, 1440] as Range]);
  const week: WeekHours = Array.from({ length: 7 }, () => []);
  let any = false;
  for (const raw of t.split(';')) {
    const rule = raw.trim();
    if (!rule) continue;
    const m = /^((?:[A-Za-z]{2}(?:-[A-Za-z]{2})?)(?:\s*,\s*[A-Za-z]{2}(?:-[A-Za-z]{2})?)*)?\s*(.*)$/.exec(rule);
    if (!m) return null;
    const days = m[1] ? parseDays(m[1].replace(/\s+/g, '')) : [0, 1, 2, 3, 4, 5, 6];
    if (!days) return null;
    const rest = m[2].trim().toLowerCase();
    if (!days.length) continue; // e.g. "PH off"
    if (rest === 'off' || rest === 'closed') {
      days.forEach((d) => { week[d] = []; });
      any = true;
      continue;
    }
    const times = rest === '24/7' || rest === '00:00-24:00' ? [[0, 1440] as Range] : parseTimes(rest);
    if (!times) return null;
    days.forEach((d) => { week[d] = times; });
    any = true;
  }
  return any ? week : null;
}

const hhmm = (m: number) => {
  const x = m % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};
const rangesText = (r: Range[]) =>
  r.length === 0 ? 'ปิด' : r.map(([s, e]) => (s === 0 && e >= 1440 ? '24 ชม.' : `${hhmm(s)}–${hhmm(e)}`)).join(', ');

/** Thai display text; falls back to the raw value when it cannot be parsed. */
export function formatOpeningHoursTh(text: string | null | undefined): string | null {
  if (!text) return null;
  const w = parseOpeningHours(text);
  if (!w) return text;
  const groups: { from: number; to: number; text: string }[] = [];
  w.forEach((r, i) => {
    const s = rangesText(r);
    const last = groups[groups.length - 1];
    if (last && last.text === s && last.to === i - 1) last.to = i;
    else groups.push({ from: i, to: i, text: s });
  });
  if (groups.length === 1) return `ทุกวัน ${groups[0].text}`;
  return groups
    .map((g) => `${g.from === g.to ? TH_DAY[g.from] : `${TH_DAY[g.from]}–${TH_DAY[g.to]}`} ${g.text}`)
    .join(' · ');
}
