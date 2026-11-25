import { commonsApiUrl, parseCommonsResponse, parseCommonsTitle, type CommonsInfo } from './commons';
import type { PlaceImage } from './imageModel';

export type AutomaticCoverRequest = {
  id: string;
  nameTh: string;
  nameEn?: string | null;
  /** Other verified names/transliterations, when the data source has them. */
  aliases?: readonly (string | null | undefined)[];
  provinceTh?: string | null;
  provinceEn?: string | null;
  provinceAliases?: readonly (string | null | undefined)[];
};

export type WikipediaLanguage = 'en' | 'th';

export type WikipediaLeadImage = {
  language: WikipediaLanguage;
  articleTitle: string;
  fileTitle: string | null;
  wikidataId: string | null;
};

const clean = (value: string | null | undefined) => (value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);

const normalize = (value: string | null | undefined) => clean(value)
  .toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

const hasThai = (value: string) => /[\u0e00-\u0e7f]/.test(value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const uniqueNames = (values: readonly (string | null | undefined)[]): string[] => {
  const seen = new Set<string>();
  return values.map(clean).filter((value) => {
    const key = normalize(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Reviewed article-title aliases. They are tried as exact Wikipedia titles;
 * they are never sent to Wikimedia Commons full-text search.
 */
const VERIFIED_PLACE_ALIASES: readonly { names: readonly string[]; aliases: readonly string[] }[] = [
  {
    names: ['ปราสาทสัจธรรม', 'Sanctuary of Truth'],
    aliases: ['Sanctuary of Truth', 'The Sanctuary of Truth', 'Prasat Sut Ja-Tum', 'Prasat Satchatham'],
  },
  {
    names: ['หาดบางแสน', 'Bang Saen Beach'],
    aliases: ['Bang Saen Beach', 'Bangsaen Beach'],
  },
  {
    names: ['สวนสัตว์เปิดเขาเขียว', 'Khao Kheow Open Zoo'],
    aliases: ['Khao Kheow Open Zoo', 'Khao Khiao Open Zoo', 'Khao Kheaw Open Zoo'],
  },
];

function aliasesFor(request: AutomaticCoverRequest): string[] {
  const supplied = uniqueNames([request.nameEn, ...(request.aliases ?? []), request.nameTh]);
  const suppliedKeys = new Set(supplied.map(normalize));
  const verified = VERIFIED_PLACE_ALIASES
    .filter((group) => [...group.names, ...group.aliases].some((name) => suppliedKeys.has(normalize(name))))
    .flatMap((group) => group.aliases);
  return uniqueNames([...supplied, ...verified]).sort((a, b) => Number(hasThai(a)) - Number(hasThai(b)));
}

/** Exact article titles to try, with Latin titles before Thai titles. */
export function automaticCoverArticleTitles(request: AutomaticCoverRequest): string[] {
  return aliasesFor(request).slice(0, 10);
}

/**
 * Query one exact Wikipedia article (redirects are followed) and ask only for
 * the article's freely licensed lead-image filename plus its Wikidata item.
 */
export function wikipediaLeadImageApiUrl(language: WikipediaLanguage, articleTitle: string): string {
  const title = clean(articleTitle);
  if (!title) throw new Error('Wikipedia article title is required');
  const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    redirects: '1',
    prop: 'pageimages|pageprops',
    piprop: 'name',
    pilicense: 'free',
    ppprop: 'wikibase_item|disambiguation',
    titles: title,
  }).toString();
  return url.toString();
}

function pagesFrom(data: unknown): Record<string, unknown>[] {
  if (!isRecord(data) || !isRecord(data.query)) return [];
  const pages = data.query.pages;
  if (Array.isArray(pages)) return pages.filter(isRecord);
  if (isRecord(pages)) return Object.values(pages).filter(isRecord);
  return [];
}

function fileTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const title = value.trim();
  if (!title) return null;
  return parseCommonsTitle(/^file:/i.test(title) ? title : `File:${title}`);
}

/**
 * Turn the filename returned by Wikipedia's `pageimage` field into the exact
 * Commons metadata request. `pageimage` is a bare filename (for example
 * `Santuaryoftruth2.jpg`), whereas the Commons API requires a `File:` title.
 * Keeping this conversion in one pure helper makes the hand-off explicit and
 * prevents a valid lead-image filename from being mistaken for a Commons URL.
 */
export function commonsApiUrlForWikipediaPageImage(pageImage: unknown, width = 1600): string | null {
  const title = fileTitle(pageImage);
  return title ? commonsApiUrl(title, width) : null;
}

/** Parse an exact Wikipedia-title lookup. Disambiguation and missing pages are refused. */
export function parseWikipediaLeadImageResponse(
  data: unknown,
  language: WikipediaLanguage,
): WikipediaLeadImage | null {
  const page = pagesFrom(data)[0];
  if (!page || page.missing !== undefined || page.invalid !== undefined || page.ns !== 0) return null;
  const props = isRecord(page.pageprops) ? page.pageprops : {};
  if (props.disambiguation !== undefined) return null;
  const articleTitle = clean(typeof page.title === 'string' ? page.title : '');
  if (!articleTitle) return null;
  const wikidataId = typeof props.wikibase_item === 'string' && /^Q[1-9]\d*$/.test(props.wikibase_item)
    ? props.wikibase_item : null;
  const leadFile = fileTitle(page.pageimage);
  if (!leadFile && !wikidataId) return null;
  return { language, articleTitle, fileTitle: leadFile, wikidataId };
}

/** Query the P18 image selected on the exact Wikidata item linked by Wikipedia. */
export function wikidataImageApiUrl(wikidataId: string): string {
  if (!/^Q[1-9]\d*$/.test(wikidataId)) throw new Error('Invalid Wikidata item');
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'wbgetclaims',
    format: 'json',
    formatversion: '2',
    origin: '*',
    entity: wikidataId,
    property: 'P18',
  }).toString();
  return url.toString();
}

/** Pick the preferred (otherwise normal) P18 image filename from Wikidata. */
export function parseWikidataImageResponse(data: unknown): string | null {
  if (!isRecord(data) || !isRecord(data.claims) || !Array.isArray(data.claims.P18)) return null;
  const claims = data.claims.P18.filter(isRecord).sort((a, b) =>
    Number(b.rank === 'preferred') - Number(a.rank === 'preferred'));
  for (const claim of claims) {
    const mainsnak = isRecord(claim.mainsnak) ? claim.mainsnak : null;
    const dataValue = mainsnak && isRecord(mainsnak.datavalue) ? mainsnak.datavalue : null;
    const title = fileTitle(dataValue?.value);
    if (mainsnak?.snaktype === 'value' && title) return title;
  }
  return null;
}

export function commonsInfoAsPlaceImage(placeId: string, placeName: string, info: CommonsInfo): PlaceImage {
  return {
    id: `auto-commons:${placeId}:${encodeURIComponent(info.title).slice(0, 180)}`,
    place_id: placeId,
    storage_path: null,
    external_url: info.thumbUrl,
    license: info.license,
    author: info.author || null,
    source_url: info.pageUrl,
    alt_th: `ภาพ${clean(placeName)}`,
    sort_order: 0,
  };
}

async function jsonFrom(url: string, signal: AbortSignal): Promise<unknown | null> {
  const response = await fetch(url, { signal, referrerPolicy: 'no-referrer' });
  if (!response.ok) return null;
  return response.json();
}

async function checkedCommonsInfo(file: string | null, signal: AbortSignal): Promise<CommonsInfo | null> {
  if (!file) return null;
  const commonsUrl = commonsApiUrlForWikipediaPageImage(file, 1600);
  if (!commonsUrl) return null;
  const commonsData = await jsonFrom(commonsUrl, signal);
  const parsed = parseCommonsResponse(commonsData);
  return parsed.ok ? parsed.info : null;
}

async function leadImageForTitle(articleTitle: string, signal: AbortSignal): Promise<CommonsInfo | null> {
  const language: WikipediaLanguage = hasThai(articleTitle) ? 'th' : 'en';
  const wikipediaData = await jsonFrom(wikipediaLeadImageApiUrl(language, articleTitle), signal);
  const lead = parseWikipediaLeadImageResponse(wikipediaData, language);
  if (!lead) return null;

  // Commons is used only to validate the selected file's URL, author and free
  // licence. A Wikipedia pageimage can occasionally be local to that wiki or
  // otherwise unavailable on Commons. In that case, retry only the P18 image
  // from the exact Wikidata item linked by the same article. This is a safe
  // fallback because it never guesses from nearby places or full-text search.
  const pageImage = await checkedCommonsInfo(lead.fileTitle, signal);
  if (pageImage) return pageImage;
  if (!lead.wikidataId) return null;

  const wikidataData = await jsonFrom(wikidataImageApiUrl(lead.wikidataId), signal);
  const wikidataTitle = parseWikidataImageResponse(wikidataData);
  if (!wikidataTitle || wikidataTitle === lead.fileTitle) return null;
  return checkedCommonsInfo(wikidataTitle, signal);
}

const resultCache = new Map<string, PlaceImage | null>();
// A successful result is safe to reuse by stable place id even when the card
// and detail APIs provide slightly different name/province fields. Nulls stay
// request-keyed so a poorer request never prevents a later richer lookup.
const successfulPlaceCache = new Map<string, PlaceImage>();
const inFlight = new Map<string, Promise<PlaceImage | null>>();

const requestKey = (request: AutomaticCoverRequest) => [
  request.id,
  ...automaticCoverArticleTitles(request).map(normalize),
].join('\u001f');

/** Find one freely reusable Wikipedia/Wikidata lead image. Failure is a normal null result. */
export function fetchAutomaticCommonsCover(request: AutomaticCoverRequest): Promise<PlaceImage | null> {
  const successful = successfulPlaceCache.get(request.id);
  if (successful) return Promise.resolve(successful);
  const key = requestKey(request);
  if (resultCache.has(key)) return Promise.resolve(resultCache.get(key) ?? null);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const work = findAutomaticWikipediaCover(request).then((image) => {
    resultCache.set(key, image);
    if (image) successfulPlaceCache.set(request.id, image);
    return image;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, work);
  return work;
}

async function findAutomaticWikipediaCover(request: AutomaticCoverRequest): Promise<PlaceImage | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    for (const title of automaticCoverArticleTitles(request)) {
      const info = await leadImageForTitle(title, controller.signal);
      if (info) return commonsInfoAsPlaceImage(request.id, request.nameTh, info);
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
