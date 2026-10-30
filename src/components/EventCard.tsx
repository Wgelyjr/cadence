import { format } from 'date-fns';
import { Pencil, Trash2 } from 'lucide-react';
import type { CareEvent } from '../lib/types';
import { EVENT_TYPE_META } from '../lib/types';
import type { Units } from '../lib/settings';
import { useSettings } from '../lib/settings';
import { fmtLength, fmtTemp, fmtVolume, fmtWeight } from '../lib/units';

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

export function eventSummary(e: CareEvent, units: Units): string {
  const fallback = EVENT_TYPE_META[e.type]?.label ?? e.type;
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
      if (e.feed_method === 'bottle') return `Bottle · ${fmtVolume(e.bottle_ml ?? 0, units)}`;
      if (e.feed_method === 'pump') return `Pump · ${fmtVolume(e.pump_ml ?? 0, units)}`;
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
          e.height_cm != null && `H ${fmtLength(e.height_cm, units)}`,
          e.weight_kg != null && `W ${fmtWeight(e.weight_kg, units)}`,
          e.head_cm != null && `head ${fmtLength(e.head_cm, units)}`,
        ]
          .filter(Boolean)
          .join(' · ') || 'Growth'
      );
    case 'health':
      return (
        [
          e.temp_c != null && fmtTemp(e.temp_c, units),
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
    case 'custom':
      return e.custom_label ?? 'Custom';
    default:
      return fallback;
  }
}

interface Props {
  event: CareEvent;
  onDelete?: (id: string) => void;
  onEdit?: (event: CareEvent) => void;
}

export default function EventCard({ event, onDelete, onEdit }: Props) {
  const units = useSettings((s) => s.units);
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-card dark:bg-slate-900">
      <div className="w-[62px] shrink-0 text-right">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {format(new Date(event.start_time), 'h:mm a')}
        </p>
        {event.end_time && (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {format(new Date(event.end_time), 'h:mm a')}
          </p>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
          {eventSummary(event, units)}
        </p>
        {event.note && (
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{event.note}</p>
        )}
      </div>
      {onEdit && (
        <button
          onClick={() => onEdit(event)}
          className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-brand-50 hover:text-brand-600 dark:text-slate-600 dark:hover:bg-brand-950/60 dark:hover:text-brand-400"
          aria-label="Edit entry"
        >
          <Pencil size={16} />
        </button>
      )}
      {onDelete && (
        <button
          onClick={() => onDelete(event.id)}
          className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 dark:text-slate-600 dark:hover:bg-red-950/60 dark:hover:text-red-400"
          aria-label="Delete entry"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}
