export type TravelMode = 'car' | 'motorcycle' | 'walk' | 'public_transport';
export type TripItemType = 'place' | 'meal' | 'cafe' | 'lodging' | 'rest_stop' | 'custom' | 'free_time' | 'depart' | 'arrive';
export type GeoPoint = { label: string; lat: number; lng: number };

export type Trip = {
  id: string;
  owner_id: string;
  name: string;
  province_ids: string[];
  start_date: string;
  end_date: string;
  travelers: number;
  mode: TravelMode;
  vehicle_count: number;
  start_point: GeoPoint | null;
  end_point: GeoPoint | null;
  day_start_time: string;
  day_end_time: string;
  budget_total: number | null;
  budget_per_person: number | null;
  reserve_pct: number;
  fuel_km_per_l: number | null;
  fuel_price_per_l: number | null;
  meal_cost_pp: number | null;
  road_factor: number;
  notes: string | null;
};

export type TripDay = {
  id: string;
  trip_id: string;
  day_index: number;
  date: string | null;
  start_time: string | null;
  is_rest_day: boolean;
  title: string | null;
  notes: string | null;
};

export type TripItem = {
  id: string;
  trip_id: string;
  day_id: string | null;
  item_type: TripItemType;
  place_id: string | null;
  title: string;
  lat: number | null;
  lng: number | null;
  sort_order: number;
  start_time: string | null;
  end_time: string | null;
  duration_min: number | null;
  travel_min_override: number | null;
  est_cost: number | null;
  is_locked_time: boolean;
  is_auto: boolean;
  notes: string | null;
  /** joined from places */
  places?: { opening_hours_text: string | null } | null;
};

export const ITEM_TYPE_LABEL: Record<TripItemType, string> = {
  place: 'สถานที่',
  meal: 'มื้ออาหาร',
  cafe: 'คาเฟ่',
  lodging: 'ที่พัก',
  rest_stop: 'จุดพักรถ',
  custom: 'กิจกรรมส่วนตัว',
  free_time: 'เวลาว่าง',
  depart: 'ออกเดินทาง',
  arrive: 'ถึงปลายทาง',
};

export const DEFAULT_DURATION: Record<TripItemType, number> = {
  place: 60, meal: 60, cafe: 45, lodging: 30, rest_stop: 15, custom: 60, free_time: 120, depart: 0, arrive: 0,
};
