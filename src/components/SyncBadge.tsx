import { Cloud, CloudOff, Loader2 } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { isSupabaseConfigured } from '../lib/config';

/** Compact sync status indicator for the header. */
export default function SyncBadge() {
  const state = useAppStore((s) => s.syncState);
  const error = useAppStore((s) => s.syncError);
  const online = useAppStore((s) => s.online);

  let icon: React.ReactNode;
  let label: string;
  let cls: string;

  if (!isSupabaseConfigured) {
    icon = <CloudOff size={14} />;
    label = 'Local';
    cls = 'bg-slate-100 text-slate-500';
  } else if (state === 'syncing') {
    icon = <Loader2 size={14} className="animate-spin" />;
    label = 'Syncing';
    cls = 'bg-brand-50 text-brand-600';
  } else if (state === 'offline' || !online) {
    icon = <CloudOff size={14} />;
    label = 'Offline';
    cls = 'bg-amber-50 text-amber-600';
  } else if (state === 'error') {
    icon = <CloudOff size={14} />;
    label = 'Sync issue';
    cls = 'bg-red-50 text-red-600';
  } else {
    icon = <Cloud size={14} />;
    label = 'Synced';
    cls = 'bg-emerald-50 text-emerald-600';
  }

  return (
    <span title={error ?? label} className={`chip ${cls}`}>
      {icon}
      {label}
    </span>
  );
}
