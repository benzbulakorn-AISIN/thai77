export type Category = { id: string; slug: string; name_th: string; icon: string; color: string; sort_order: number; is_active: boolean };

export type PlaceSource = { id: string; source_url: string; source_name: string | null; source_type: string; fields: string[]; checked_at: string };

export type Place = {
  id: string;
  name_th: string;
  name_en: string | null;
  province_id: string;
  district_id: string | null;
  category_id: string;
  short_description: string | null;
  highlights: string[];
  lat: number | null;
  lng: number | null;
  address: string | null;
  opening_hours_text: string | null;
  closed_days_text: string | null;
  fee_thai: number | null;
  fee_foreigner: number | null;
  parking_fee: number | null;
  est_cost_per_person: number | null;
  suggested_minutes: number | null;
  best_time_of_day: string | null;
  best_months: number[];
  phone: string | null;
  website_url: string | null;
  social_url: string | null;
  google_maps_url: string | null;
  popularity: number;
  state: 'active' | 'seasonal' | 'temporarily_closed' | 'permanently_closed';
  verification: 'verified' | 'pending' | 'outdated' | 'demo';
  verified_at: string | null;
  is_demo: boolean;
};

export type UserStatus = 'none' | 'want' | 'planned' | 'visited';

export type MyPlaceState = { status: UserStatus; rating: number | null; favorite: boolean; lastVisited: string | null };

export const STATUS_TEXT: Record<UserStatus, string> = {
  none: 'ยังไม่สนใจ',
  want: 'อยากไป',
  planned: 'อยู่ในแผนทริป',
  visited: 'เคยไปแล้ว',
};
