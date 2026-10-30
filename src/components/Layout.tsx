import type { ReactNode } from 'react';
import { Home, PlusCircle, List, Bot, Settings as SettingsIcon } from 'lucide-react';
import type { Tab } from '../App';
import ChildSwitcher from './ChildSwitcher';
import SyncBadge from './SyncBadge';

const TABS: Array<{ id: Tab; label: string; icon: typeof Home }> = [
  { id: 'today', label: 'Today', icon: Home },
  { id: 'log', label: 'Log', icon: PlusCircle },
  { id: 'timeline', label: 'History', icon: List },
  { id: 'barry', label: 'Barry', icon: Bot },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

interface Props {
  tab: Tab;
  onTab: (t: Tab) => void;
  children: ReactNode;
}

export default function Layout({ tab, onTab, children }: Props) {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <header className="pt-safe flex items-center justify-between gap-2 px-4 pb-2 pt-3">
        <ChildSwitcher />
        <SyncBadge />
      </header>

      <main className="no-scrollbar flex-1 overflow-y-auto px-4 pb-4 pt-1">{children}</main>

      <nav className="pb-safe border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="flex">
          {TABS.map((t) => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => onTab(t.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition ${
                  active ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
