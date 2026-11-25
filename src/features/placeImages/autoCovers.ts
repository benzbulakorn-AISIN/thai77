import type { PlaceImage } from './imageModel';

/**
 * Compatibility shape retained for card callers that already pass place names.
 * The database-backed cover loader only uses `id`; the other fields are useful
 * to Admin review/import tools but are never sent to an external API at runtime.
 */
export type AutomaticCoverRequest = {
  id: string;
  nameTh: string;
  nameEn?: string | null;
  aliases?: readonly (string | null | undefined)[];
  provinceTh?: string | null;
  provinceEn?: string | null;
  provinceAliases?: readonly (string | null | undefined)[];
};

/**
 * @deprecated Runtime image discovery was removed. Store an Admin-reviewed row
 * in public.place_images and load it with fetchCovers/fetchPlaceImageSet.
 */
export function fetchAutomaticCommonsCover(_request: AutomaticCoverRequest): Promise<PlaceImage | null> {
  return Promise.resolve(null);
}
