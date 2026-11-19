/** "#abc" | "#AABBCC" | " #aabbcc " -> "#aabbcc"; anything else -> fallback (never an invalid colour in <meta theme-color>) */
export function normalizeHexColor(raw: string | null | undefined, fallback: string): string {
  const s = String(raw ?? '').trim();
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  if (m3) return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}`.toLowerCase();
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : fallback;
}

export const THEME_COLOR_FALLBACK = '#0369a1';

/**
 * Keeps <meta name="theme-color"> equal to the header colour of the chosen theme (so the phone's status bar blends in).
 * The theme is switched by classes / attributes on <html>, which is what we watch: no change to the theme code is needed.
 */
export function watchThemeColor(doc: Document = document): () => void {
  const root = doc.documentElement;
  const apply = () => {
    let meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = doc.createElement('meta');
      meta.name = 'theme-color';
      doc.head.appendChild(meta);
    }
    const css = doc.defaultView?.getComputedStyle(root).getPropertyValue('--surface') ?? '';
    meta.content = normalizeHexColor(css, THEME_COLOR_FALLBACK);
  };
  apply();
  const mo = new MutationObserver(apply);
  mo.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  return () => mo.disconnect();
}
