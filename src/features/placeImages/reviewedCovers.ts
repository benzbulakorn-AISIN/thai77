export type ReviewedCoverRequest = string | { id: string };

/** Stable, de-duplicated place ids for one Supabase cover query. */
export function approvedCoverIds(input: readonly ReviewedCoverRequest[]): string[] {
  const ids = input.map((request) => typeof request === 'string' ? request : request.id).filter(Boolean);
  return [...new Set(ids)];
}
