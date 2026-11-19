// A pretend browser for the service worker: CacheStorage, fetch, events. The REAL sw.js text runs inside it.
import fs from 'node:fs';
import path from 'node:path';
import { renderSw } from '../../scripts/pwa-lib.mjs';

export const SCOPE = 'https://example.test/thai77/';
export const PRECACHE = ['', 'offline.html', 'manifest.webmanifest', 'assets/app-AAA.js', 'assets/app-BBB.css'];

const key = (r: unknown): string => (typeof r === 'string' ? r : (r as { url: string }).url);

export class FakeCache {
  items = new Map<string, Response>();
  async match(req: unknown) { const r = this.items.get(key(req)); return r ? r.clone() : undefined; }
  async put(req: unknown, res: Response) { this.items.set(key(req), res); }
  async keys() { return [...this.items.keys()].map((u) => new Request(u)); }
  async delete(req: unknown) { return this.items.delete(key(req)); }
}
export class FakeCaches {
  stores = new Map<string, FakeCache>();
  async open(n: string) { if (!this.stores.has(n)) this.stores.set(n, new FakeCache()); return this.stores.get(n)!; }
  async keys() { return [...this.stores.keys()]; }
  async delete(n: string) { return this.stores.delete(n); }
  async match(req: unknown) { for (const s of this.stores.values()) { const m = await s.match(req); if (m) return m; } return undefined; }
}

export type FetchCall = { url: string; cache: string | undefined };
export type Handler = (input: Request | string, init?: RequestInit) => Response | Promise<Response>;

export function swText(over: { buildId?: string; precache?: string[]; tweak?: (s: string) => string } = {}): string {
  const tpl = fs.readFileSync(path.join(process.cwd(), 'scripts', 'sw.template.js'), 'utf8');
  let out = renderSw(tpl, { buildId: over.buildId ?? 'build111111', precache: over.precache ?? PRECACHE });
  if (over.tweak) out = over.tweak(out);
  return out;
}

export function boot(over: { buildId?: string; precache?: string[]; tweak?: (s: string) => string; caches?: FakeCaches } = {}) {
  const caches = over.caches ?? new FakeCaches();
  const calls: FetchCall[] = [];
  const state: { handler: Handler } = { handler: () => new Response('ok', { status: 200 }) };
  const handlers: Record<string, ((e: any) => void)[]> = { install: [], activate: [], fetch: [], message: [] };
  const flags = { skipWaiting: 0, claim: 0 };
  const self = {
    registration: { scope: SCOPE },
    addEventListener: (t: string, fn: (e: any) => void) => { (handlers[t] ??= []).push(fn); },
    skipWaiting: () => { flags.skipWaiting++; return Promise.resolve(); },
    clients: { claim: () => { flags.claim++; return Promise.resolve(); } },
  };
  const fetchFn = (input: Request | string, init?: RequestInit) => {
    calls.push({ url: key(input), cache: typeof input === 'string' ? init?.cache : (input as Request).cache });
    try { return Promise.resolve(state.handler(input, init)); } catch (e) { return Promise.reject(e); } // a real fetch never throws synchronously
  };
  new Function('self', 'caches', 'fetch', swText(over))(self, caches, fetchFn);

  const run = async (type: 'install' | 'activate') => {
    const waits: Promise<unknown>[] = [];
    handlers[type].forEach((h) => h({ waitUntil: (p: Promise<unknown>) => waits.push(p) }));
    await Promise.all(waits);
  };
  const doFetch = async (request: any) => {
    let responded: Promise<Response> | null = null;
    const waits: Promise<unknown>[] = [];
    handlers.fetch.forEach((h) => h({ request, respondWith: (p: Promise<Response>) => { responded = Promise.resolve(p); }, waitUntil: (p: Promise<unknown>) => waits.push(p) }));
    const res = responded ? await responded : null;
    await Promise.all(waits);
    return { handled: responded !== null, res };
  };
  const message = (data: unknown, port?: { postMessage(v: unknown): void }) => handlers.message.forEach((h) => h({ data, ports: port ? [port] : [] }));
  const nav = () => ({ url: SCOPE, method: 'GET', mode: 'navigate', headers: { has: () => false } });
  const asset = (rel: string, init?: RequestInit) => new Request(new URL(rel, SCOPE).href, init);
  return { caches, calls, state, flags, run, doFetch, message, nav, asset };
}

/** an answer from our own address, like a real same-origin fetch gives (type "basic"); `new Response()` alone has type "default" */
export const basic = (r: Response): Response => { Object.defineProperty(r, 'type', { value: 'basic' }); return r; };
export const ok = (body: string, extra: ResponseInit = {}) => basic(new Response(body, { status: 200, ...extra }));
export const reply = (status: number, body = 'x', extra: ResponseInit = {}) => basic(new Response(body, { status, ...extra }));
export const text = async (r: Response | null | undefined) => (r ? r.text() : null);
