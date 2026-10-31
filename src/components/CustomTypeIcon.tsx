import type { CSSProperties } from 'react';
import {
  Baby,
  Bath,
  BookOpen,
  Car,
  Coffee,
  Cloud,
  Droplets,
  Flower2,
  Gamepad2,
  Gift,
  Heart,
  Music,
  PartyPopper,
  Pill,
  Plane,
  Smile,
  Snowflake,
  Star,
  Sun,
  Syringe,
  Umbrella,
  Utensils,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Icons a parent can pick for a custom event type (Settings > Custom events).
 * Keyed by a stable name — that name is what's stored on the type — so the
 * settings UI, log picker, chips and rhythm card all render the same glyph.
 */
export const CUSTOM_TYPE_ICONS: Record<string, LucideIcon> = {
  star: Star,
  pill: Pill,
  syringe: Syringe,
  sun: Sun,
  cloud: Cloud,
  snowflake: Snowflake,
  umbrella: Umbrella,
  coffee: Coffee,
  utensils: Utensils,
  music: Music,
  book: BookOpen,
  game: Gamepad2,
  heart: Heart,
  zap: Zap,
  flower: Flower2,
  party: PartyPopper,
  bath: Bath,
  car: Car,
  plane: Plane,
  gift: Gift,
  baby: Baby,
  smile: Smile,
  droplet: Droplets,
};

export const CUSTOM_TYPE_ICON_NAMES = Object.keys(CUSTOM_TYPE_ICONS);

/**
 * Resolve a stored icon name to its glyph. Unknown or absent names fall back
 * to a star, so old types and renamed icons never break rendering.
 */
export function CustomTypeIcon({
  icon,
  size = 16,
  className,
  style,
}: {
  icon?: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const Cmp = (icon && CUSTOM_TYPE_ICONS[icon]) || Star;
  return <Cmp size={size} className={className} style={style} />;
}
