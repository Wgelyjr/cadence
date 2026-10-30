import { useEffect, useState } from 'react';
import { Moon } from 'lucide-react';
import { useAppStore } from './lib/store';
import Layout from './components/Layout';
import Onboarding from './pages/Onboarding';
import Today from './pages/Today';
import Log from './pages/Log';
import Timeline from './pages/Timeline';
import Barry from './pages/Barry';
import Settings from './pages/Settings';

export type Tab = 'today' | 'log' | 'timeline' | 'barry' | 'settings';

function Splash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-brand-600">
      <Moon size={44} className="animate-pulse-soft" />
      <p className="text-sm font-medium text-slate-500">Loading…</p>
    </div>
  );
}

export default function App() {
  const ready = useAppStore((s) => s.ready);
  const children = useAppStore((s) => s.children);
  const init = useAppStore((s) => s.init);
  const setOnline = useAppStore((s) => s.setOnline);
  const [tab, setTab] = useState<Tab>('today');

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [setOnline]);

  if (!ready) return <Splash />;

  const hasChild = children.some((c) => !c.deleted);
  if (!hasChild) return <Onboarding />;

  return (
    <Layout tab={tab} onTab={setTab}>
      {tab === 'today' && <Today goToLog={() => setTab('log')} />}
      {tab === 'log' && <Log />}
      {tab === 'timeline' && <Timeline />}
      {tab === 'barry' && <Barry />}
      {tab === 'settings' && <Settings />}
    </Layout>
  );
}
