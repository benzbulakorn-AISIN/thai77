// Guest Mode data model: what a visitor (not signed in) may keep on THIS device. Pure — no React, no storage, no network.
//   one entry per place:  s = status (want | visited | none) · f = favourite · t = last change (ms)
import type { MyPlaceState } from '../places/types';

export const GUEST_VERSION = 1;
export const GUEST_KEY = 'thai77.guest.places.v1';
export const MAX_GUEST_ENTRIES = 500;

/** error codes thrown by hooks / read by the UI */
export const AUTH_LOADING_ERROR = 'auth-loading';
export const GUEST_FULL_ERROR = 'guest-full';
export const GUEST_NOTICE = 'บันทึกไว้ในเครื่องนี้ — เข้าสู่ระบบเพื่อเก็บถาวรและใช้ข้ามเครื่อง';

export type GuestStatus = 'want' | 'visited';
export type GuestEntry = { s: GuestStatus | null; f: boolean; t: number };
export type GuestItems = Record<string, GuestEntry>;
export type GuestState = { items: GuestItems };
export type GuestError = 'invalid' | 'full';
export type Change = { state: GuestState; error: GuestError | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isPlaceId = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const emptyGuest = (): GuestState => ({ items: {} });
const count = (items: GuestItems) => Object.keys(items).length;

/** Reads what is in localStorage. Anything unexpected is ignored; at most MAX_GUEST_ENTRIES (the newest) are kept. */
export function parseGuest(json: string | null | undefined): GuestState {
  const state = emptyGuest();
  if (!json) return state;
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return state; }
  if (!isObj(raw) || raw.v !== GUEST_VERSION || !isObj(raw.items)) return state;
  const list: [string, GuestEntry][] = [];
  for (const [rawId, e] of Object.entries(raw.items)) {
    const id = rawId.toLowerCase();
    if (!isPlaceId(id) || !isObj(e)) continue;
    const s: GuestStatus | null = e.s === 'want' || e.s === 'visited' ? e.s : null;
    const f = e.f === true;
    if (s === null && !f) continue; // an empty entry carries no information
    const t = typeof e.t === 'number' && Number.isFinite(e.t) && e.t > 0 ? Math.floor(e.t) : 0;
    list.push([id, { s, f, t }]);
  }
  list.sort((a, b) => b[1].t - a[1].t || a[0].localeCompare(b[0]));
  for (const [id, e] of list.slice(0, MAX_GUEST_ENTRIES)) state.items[id] = e;
  return state;
}

export const serializeGuest = (state: GuestState): string => JSON.stringify({ v: GUEST_VERSION, items: state.items });

/** the app's status words -> what a guest can keep ("planned" only exists for trips, so it counts as "want") */
const toGuestStatus = (s: string): GuestStatus | null => (s === 'visited' ? 'visited' : s === 'none' ? null : 'want');

function put(state: GuestState, id: string, next: GuestEntry | null): GuestState {
  const items = { ...state.items };
  if (next === null || (next.s === null && !next.f)) delete items[id];
  else items[id] = next;
  return { items };
}

/** An unchanged result returns the SAME state object, so nothing is saved and nobody is notified. */
export function withStatus(state: GuestState, rawId: string, status: string, now: number): Change {
  const id = String(rawId ?? '').toLowerCase();
  if (!isPlaceId(id)) return { state, error: 'invalid' };
  const s = toGuestStatus(status);
  const cur = state.items[id];
  if (!cur && s === null) return { state, error: null };
  if (!cur && count(state.items) >= MAX_GUEST_ENTRIES) return { state, error: 'full' };
  if (cur && cur.s === s) return { state, error: null };
  return { state: put(state, id, { s, f: cur?.f ?? false, t: now }), error: null };
}

export function withFavorite(state: GuestState, rawId: string, favorite: boolean, now: number): Change {
  const id = String(rawId ?? '').toLowerCase();
  if (!isPlaceId(id)) return { state, error: 'invalid' };
  const cur = state.items[id];
  if (!cur && !favorite) return { state, error: null };
  if (!cur && count(state.items) >= MAX_GUEST_ENTRIES) return { state, error: 'full' };
  if (cur && cur.f === favorite) return { state, error: null };
  return { state: put(state, id, { s: cur?.s ?? null, f: favorite, t: now }), error: null };
}

export function withoutIds(state: GuestState, ids: string[]): GuestState {
  const drop = new Set(ids.map((i) => String(i).toLowerCase()));
  if (!Object.keys(state.items).some((k) => drop.has(k))) return state;
  const items: GuestItems = {};
  for (const [k, v] of Object.entries(state.items)) if (!drop.has(k)) items[k] = v;
  return { items };
}

export type GuestCounts = { want: number; visited: number; favorite: number; entries: number };

export function guestCounts(items: GuestItems): GuestCounts {
  const c: GuestCounts = { want: 0, visited: 0, favorite: 0, entries: 0 };
  for (const e of Object.values(items)) {
    c.entries++;
    if (e.s === 'want') c.want++;
    if (e.s === 'visited') c.visited++;
    if (e.f) c.favorite++;
  }
  return c;
}

/** ids with status "want", newest first */
export function wantIds(items: GuestItems): string[] {
  return Object.entries(items)
    .filter(([, e]) => e.s === 'want')
    .sort((a, b) => b[1].t - a[1].t || a[0].localeCompare(b[0]))
    .map(([id]) => id);
}

/** places that have a status (want / visited), sorted by id */
export function statusEntries(items: GuestItems): [string, GuestStatus][] {
  return Object.entries(items)
    .flatMap(([id, e]) => (e.s ? [[id, e.s] as [string, GuestStatus]] : []))
    .sort((a, b) => a[0].localeCompare(b[0]));
}

/** changes only when a status changes (favourites and timestamps do not matter) — used as an effect dependency */
export const statusKey = (items: GuestItems): string => statusEntries(items).map(([id, s]) => `${id}:${s}`).join(',');

const NONE: MyPlaceState = { status: 'none', rating: null, favorite: false, lastVisited: null };
export function toMyState(e: GuestEntry | undefined): MyPlaceState {
  return e ? { status: e.s ?? 'none', rating: null, favorite: e.f, lastVisited: null } : NONE;
}
