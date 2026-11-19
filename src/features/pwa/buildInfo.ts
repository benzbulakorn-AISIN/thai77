import { fmtDateTh } from '../routing/time';

export type BuildInfo = { id: string; builtAt: string | null; pwa: boolean };

/** build.json (written by scripts/finalize-pwa.mjs) -> safe object */
export function parseBuildInfo(json: unknown): BuildInfo | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null;
  const j = json as Record<string, unknown>;
  const id = typeof j.id === 'string' && /^[0-9a-z]{2,64}$/i.test(j.id) ? j.id : null;
  if (!id) return null;
  const at = typeof j.builtAt === 'string' && Number.isFinite(Date.parse(j.builtAt)) ? j.builtAt : null;
  return { id, builtAt: at, pwa: j.pwa === true };
}

/** "d4435c733b · พฤ. 19 พ.ย. 2569" (the date is shown in Thailand time) */
export function formatBuildInfo(info: BuildInfo): string {
  if (!info.builtAt) return info.id;
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(info.builtAt));
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${info.id} · ${fmtDateTh(iso, true)}` : info.id;
}

/** the CURRENT build on the server (never from a cache) */
export async function fetchBuildInfo(base: string): Promise<BuildInfo | null> {
  try {
    const res = await fetch(`${base}build.json`, { cache: 'no-store' });
    return res.ok ? parseBuildInfo(await res.json()) : null;
  } catch {
    return null;
  }
}
