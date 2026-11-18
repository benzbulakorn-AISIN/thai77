export type ThemeId = 'ocean' | 'forest' | 'sunset' | 'sakura' | 'midnight' | 'thai';
export type ColorMode = 'light' | 'dark' | 'system';

export const THEMES: { id: ThemeId; label: string; swatch: string }[] = [
  { id: 'ocean', label: 'Ocean Blue', swatch: '#0369A1' },
  { id: 'forest', label: 'Forest Green', swatch: '#15803D' },
  { id: 'sunset', label: 'Sunset Orange', swatch: '#C2410C' },
  { id: 'sakura', label: 'Sakura Pink', swatch: '#BE185D' },
  { id: 'midnight', label: 'Midnight Dark', swatch: '#6366F1' },
  { id: 'thai', label: 'Thai Contemporary', swatch: '#7C2D12' },
];
