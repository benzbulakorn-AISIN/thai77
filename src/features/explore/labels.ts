/** "ภาคเหนือ" -> "เหนือ" (shorter text on the region map, so labels collide less) */
export function shortRegionLabel(name: string): string {
  const s = name.replace(/^ภาค\s*/, '').trim();
  return s || name;
}
