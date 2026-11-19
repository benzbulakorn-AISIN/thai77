import { describe, expect, it } from 'vitest';
import { IOS_STEPS, detectInstallState, isInAppBrowser, isIos } from '../../src/features/pwa/installModel';
import { THEME_COLOR_FALLBACK, normalizeHexColor } from '../../src/features/pwa/themeColor';
import { RELOAD_KEY, RELOAD_WINDOW_MS, handleLoadFailure, shouldAutoReload } from '../../src/features/pwa/reloadGuard';
import { formatBuildInfo, parseBuildInfo } from '../../src/features/pwa/buildInfo';
import { createStore } from '../../src/features/pwa/storeCore';

const UA = {
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
  ipadSafariAsMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  windowsFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  lineAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 Line/14.10.0',
  lineIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.10.0',
  facebookIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0.0]',
  instagram: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 Instagram 330.0.0',
};
const env = (ua: string, o: Partial<Parameters<typeof detectInstallState>[0]> = {}) => ({ ua, standalone: false, hasPrompt: false, platform: '', maxTouchPoints: 0, ...o });

describe('detectInstallState', () => {
  it('Android / desktop Chrome with the browser\'s offer -> "prompt"', () => {
    expect(detectInstallState(env(UA.androidChrome, { hasPrompt: true }))).toBe('prompt');
    expect(detectInstallState(env(UA.windowsChrome, { hasPrompt: true }))).toBe('prompt');
  });
  it('no offer yet (or already used) on Chrome -> "unsupported" (the text then points to the browser menu)', () => {
    expect(detectInstallState(env(UA.androidChrome))).toBe('unsupported');
    expect(detectInstallState(env(UA.windowsFirefox))).toBe('unsupported');
    expect(detectInstallState(env(UA.macSafari, { platform: 'MacIntel', maxTouchPoints: 0 }))).toBe('unsupported');
  });
  it('iPhone / iPad (Safari, Chrome for iOS, iPadOS posing as a Mac) -> "ios" (manual steps)', () => {
    expect(detectInstallState(env(UA.iphoneSafari))).toBe('ios');
    expect(detectInstallState(env(UA.iphoneChrome))).toBe('ios');
    expect(detectInstallState(env(UA.ipadSafariAsMac, { platform: 'MacIntel', maxTouchPoints: 5 }))).toBe('ios');
  });
  it('opened from the home-screen icon -> "installed" (wins over everything)', () => {
    for (const ua of Object.values(UA)) expect(detectInstallState(env(ua, { standalone: true, hasPrompt: true }))).toBe('installed');
  });
  it('LINE / Facebook / Instagram viewers cannot install -> "in-app" (even on iPhone, even if an offer exists)', () => {
    for (const ua of [UA.lineAndroid, UA.lineIos, UA.facebookIos, UA.instagram]) {
      expect(detectInstallState(env(ua))).toBe('in-app');
      expect(detectInstallState(env(ua, { hasPrompt: true }))).toBe('in-app');
    }
  });
  it('helpers', () => {
    expect(isInAppBrowser(UA.androidChrome)).toBe(false);
    expect(isInAppBrowser(UA.iphoneSafari)).toBe(false);
    expect(isInAppBrowser('Mozilla/5.0 ... MicroMessenger/8.0')).toBe(true);
    expect(isIos(UA.macSafari, 'MacIntel', 0)).toBe(false);
    expect(isIos(UA.macSafari, 'MacIntel', 5)).toBe(true);
    expect(isIos(UA.windowsChrome, 'Win32', 10)).toBe(false);
  });
  it('three steps for iPhone, in Thai', () => {
    expect(IOS_STEPS).toHaveLength(3);
    expect(IOS_STEPS[1]).toContain('Add to Home Screen');
  });
});

describe('normalizeHexColor', () => {
  it('accepts #rgb and #rrggbb in any case, with spaces', () => {
    expect(normalizeHexColor(' #FFFFFF ', 'x')).toBe('#ffffff');
    expect(normalizeHexColor('#0B1720', 'x')).toBe('#0b1720');
    expect(normalizeHexColor('#abc', 'x')).toBe('#aabbcc');
    expect(normalizeHexColor('#F0F', 'x')).toBe('#ff00ff');
  });
  it('anything else -> the fallback (a bad value would blank the status bar)', () => {
    for (const bad of ['', '   ', 'red', 'rgb(1,2,3)', '#12', '#1234567', '#gggggg', 'ffffff', '#ffffffff', null, undefined, 'var(--surface)']) {
      expect(normalizeHexColor(bad as string, THEME_COLOR_FALLBACK)).toBe(THEME_COLOR_FALLBACK);
    }
  });
});

describe('reload guard (reload ONCE after a deploy, never in a loop)', () => {
  it('shouldAutoReload', () => {
    expect(shouldAutoReload(null, 1000)).toBe(true);
    expect(shouldAutoReload(undefined, 1000)).toBe(true);
    expect(shouldAutoReload(NaN, 1000)).toBe(true);
    expect(shouldAutoReload(1000, 1000 + RELOAD_WINDOW_MS - 1)).toBe(false);
    expect(shouldAutoReload(1000, 1000 + RELOAD_WINDOW_MS)).toBe(true);
    expect(shouldAutoReload(5000, 1000)).toBe(true);                   // clock went backwards
  });
  const mem = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
  it('first failure reloads and remembers; a second one right after does not', () => {
    const st = mem(); let reloads = 0;
    expect(handleLoadFailure({ storage: st, now: 100_000, reload: () => { reloads++; } })).toBe(true);
    expect(st.m.get(RELOAD_KEY)).toBe('100000');
    expect(handleLoadFailure({ storage: st, now: 100_500, reload: () => { reloads++; } })).toBe(false);
    expect(reloads).toBe(1);
    expect(handleLoadFailure({ storage: st, now: 100_000 + RELOAD_WINDOW_MS, reload: () => { reloads++; } })).toBe(true);
    expect(reloads).toBe(2);
  });
  it('no storage (private mode): still reloads, and a storage that throws does not crash', () => {
    let reloads = 0;
    expect(handleLoadFailure({ storage: null, now: 1, reload: () => { reloads++; } })).toBe(true);
    const bad = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(handleLoadFailure({ storage: bad, now: 1, reload: () => { reloads++; } })).toBe(true);
    expect(reloads).toBe(2);
  });
  it('a damaged stored value is treated as "never reloaded"', () => {
    const st = mem(); st.m.set(RELOAD_KEY, 'garbage');
    expect(handleLoadFailure({ storage: st, now: 5, reload: () => {} })).toBe(true);
  });
});

describe('build info', () => {
  it('parses build.json and rejects odd data', () => {
    expect(parseBuildInfo({ id: 'd4435c733b', builtAt: '2026-11-19T16:23:32.068Z', pwa: true, site: 'x' })).toEqual({ id: 'd4435c733b', builtAt: '2026-11-19T16:23:32.068Z', pwa: true });
    expect(parseBuildInfo({ id: 'off', builtAt: 'garbage', pwa: false })).toEqual({ id: 'off', builtAt: null, pwa: false });
    for (const bad of [null, undefined, 'x', 5, [], {}, { id: '' }, { id: 5 }, { id: '<script>' }, { id: 'a'.repeat(100) }]) expect(parseBuildInfo(bad)).toBeNull();
  });
  it('shows the id and the date in Thailand time (a late-evening UTC build is already the next Thai day)', () => {
    expect(formatBuildInfo({ id: 'd4435c733b', builtAt: '2026-11-19T10:00:00Z', pwa: true })).toBe('d4435c733b · พฤ. 19 พ.ย. 2569');
    expect(formatBuildInfo({ id: 'd4435c733b', builtAt: '2026-11-19T18:30:00Z', pwa: true })).toBe('d4435c733b · ศ. 20 พ.ย. 2569');
    expect(formatBuildInfo({ id: 'abc123', builtAt: null, pwa: true })).toBe('abc123');
  });
});

describe('createStore', () => {
  it('notifies only when something really changed, and the snapshot object is stable otherwise', () => {
    const s = createStore({ a: 1, b: false }); let n = 0;
    const off = s.subscribe(() => { n++; });
    const first = s.get();
    s.set({ a: 1 }); s.set({}); s.set({ b: false });
    expect(n).toBe(0);
    expect(s.get()).toBe(first);
    s.set({ a: 2 });
    expect(n).toBe(1);
    expect(s.get()).not.toBe(first);
    expect(s.get()).toEqual({ a: 2, b: false });
    off(); s.set({ a: 3 });
    expect(n).toBe(1);
  });
  it('does not modify the object it was given', () => {
    const init = { x: 1 }; const s = createStore(init);
    s.set({ x: 2 });
    expect(init).toEqual({ x: 1 });
  });
});
