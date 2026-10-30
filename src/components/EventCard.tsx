import { format } from 'date-fns';
import { Trash2 } from 'lucide-react';
import type { CareEvent } from '../lib/types';
import { EVENT_TYPE_META } from '../lib/types';
import { useAppStore } from '../lib/store';

function durationLabel(e: CareEvent): string {
  if (!e.end_time) return '';
  const mins = Math.round(
    (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 60000,
  );
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function eventSummary(e: CareEvent): string {
  const fallback = EVENT_TYPE_META[e.type].label;
  switch (e.type) {
    case 'sleep': {
      const d = durationLabel(e);
      const kind = e.sleep_kind === 'night' ? 'Night sleep' : 'Nap';
      return d ? `${kind} · ${d}` : kind;
    }
    case 'feed': {
      if (e.feed_method === 'nursing')
        return `Nursing · ${e.feed_side ?? 'both'}${
          e.feed_side_duration_min ? ` · ${e.feed_side_duration_min}m/side` : ''
        }`;
      if (e.feed_method === 'bottle') return `Bottle · ${e.bottle_ml ?? 0} ml`;
      if (e.feed_method === 'pump') return `Pump · ${e.pump_ml ?? 0} ml`;
      return 'Feed';
    }
    case 'diaper': {
      let s = e.diaper_type ?? 'diaper';
      if (e.diaper_type !== 'wet' && (e.stool_color || e.stool_consistency)) {
        s += ` · ${[e.stool_color, e.stool_consistency].filter(Boolean).join(', ')}`;
      }
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    case 'growth':
      return (
        [
          e.height_cm && `${e.height_cm} cm`,
          e.weight_kg && `${e.weight_kg} kg`,
          e.head_cm && `head ${e.head_cm} cm`,
        ]
          .filter(Boolean)
          .join(' · ') || 'Growth'
      );
    case 'health':
      return (
        [
          e.temp_c && `${e.temp_c}°C`,
          e.medicine_name && `${e.medicine_name}${e.medicine_dose ? ' ' + e.medicine_dose : ''}`,
        ]
          .filter(Boolean)
          .join(' · ') || 'Health'
      );
    case 'milestone':
      return e.label ?? 'Milestone';
    case 'solid_food':
      return e.food_items?.length ? e.food_items.join(', ') : 'Solid food';
    case 'allergy':
      return `${e.label ?? 'Allergy'}${e.allergy_severity ? ` · ${e.allergy_severity}` : ''}`;
    case 'contraction':
      return `Contraction${e.contraction_duration_sec ? ` · ${e.contraction_duration_sec}s` : ''}`;
    default:
      return fallback;
  }
}

interface Props {
  event: CareEvent;
  onDelete?: (id: string) => void;
}

export default function EventCard({ event, onDelete }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-card">
      <div className="w-[62px] shrink-0 text-right">
        <p className="text-sm font-semibold text-slate-700">
          {format(new Date(event.start_time), 'h:mm a')}
        </p>
        {event.end_time && (
          <p className="text-xs text-slate-400">{format(new Date(event.end_time), 'h:mm a')}</p>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">
          {eventSummary(event)}
        </p>
        {event.note && <p className="truncate text-xs text-slate-500">{event.note}</p>}
      </div>
      {onDelete && (
        <button
          onClick={() => onDelete(event.id)}
          className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
          aria-label="Delete entry"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}
