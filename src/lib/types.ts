/**
 * Domain model. A single flexible `CareEvent` table covers every care type;
 * type-specific fields are optional. This keeps logging simple and the schema
 * stable as features grow.
 */

export type EventType =
  | 'sleep'
  | 'feed'
  | 'diaper'
  | 'growth'
  | 'health'
  | 'milestone'
  | 'solid_food'
  | 'allergy'
  | 'contraction'
  | 'custom';

export const BUILTIN_EVENT_TYPES = [
  'sleep',
  'feed',
  'diaper',
  'growth',
  'health',
  'milestone',
  'solid_food',
  'allergy',
  'contraction',
] as const;

export type BuiltinEventType = (typeof BUILTIN_EVENT_TYPES)[number];

export interface Child {
  id: string;
  /** Remote care-group id (set when synced); absent in pure local mode. */
  care_group_id?: string;
  name: string;
  /** ISO date, e.g. "2026-03-14". */
  birth_date: string;
  /** Optional time of day, "HH:mm". */
  birth_time?: string;
  color?: string;
  created_at: string;
  updated_at: string;
  deleted?: boolean;
}

export interface CareEvent {
  id: string;
  child_id: string;
  care_group_id?: string;
  type: EventType;
  /** ISO datetime. */
  start_time: string;
  /** ISO datetime. */
  end_time?: string;

  // Sleep
  sleep_kind?: 'nap' | 'night';

  // Feeding
  feed_method?: 'nursing' | 'bottle' | 'pump';
  feed_side?: 'left' | 'right' | 'both';
  /** Minutes per side (nursing). */
  feed_side_duration_min?: number;
  bottle_ml?: number;
  pump_ml?: number;

  // Diaper
  diaper_type?: 'wet' | 'dirty' | 'mixed';
  stool_color?: string;
  stool_consistency?: string;

  // Growth / health
  height_cm?: number;
  weight_kg?: number;
  head_cm?: number;
  temp_c?: number;
  medicine_name?: string;
  medicine_dose?: string;

  // Custom events (user-defined types)
  /** Id of the user-defined type (see settings.customTypes). */
  custom_type_id?: string;
  /** Denormalized label so entries render even if the type is later deleted. */
  custom_label?: string;

  // Free-form / food / allergy / milestone / contraction
  label?: string;
  food_items?: string[];
  allergy_reaction?: string;
  allergy_severity?: 'mild' | 'moderate' | 'severe';
  /** Contraction duration in seconds. */
  contraction_duration_sec?: number;
  note?: string;
  /** Data URLs or storage paths of attached photos. */
  photos?: string[];

  created_at: string;
  updated_at: string;
  deleted?: boolean;
}

export interface BarryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BarryChildContext {
  name?: string;
  ageWeeks?: number;
  recentSummary?: string;
}

export const EVENT_TYPE_META: Record<
  EventType,
  { label: string; icon: string; hint: string }
> = {
  sleep: { label: 'Sleep', icon: 'Moon', hint: 'Nap or night sleep' },
  feed: { label: 'Feed', icon: 'Milk', hint: 'Nursing, bottle or pump' },
  diaper: { label: 'Diaper', icon: 'Droplets', hint: 'Wet, dirty or mixed' },
  growth: { label: 'Growth', icon: 'Ruler', hint: 'Height, weight, head' },
  health: { label: 'Health', icon: 'Thermometer', hint: 'Temperature, medicine' },
  milestone: { label: 'Milestone', icon: 'Sparkles', hint: 'Firsts & moments' },
  solid_food: { label: 'Solid food', icon: 'Apple', hint: 'Purees & baby-led' },
  allergy: { label: 'Allergy', icon: 'TriangleAlert', hint: 'Reactions to log' },
  contraction: { label: 'Contraction', icon: 'Timer', hint: 'Labor timer' },
  custom: { label: 'Custom', icon: 'Star', hint: 'Your own event types' },
};
