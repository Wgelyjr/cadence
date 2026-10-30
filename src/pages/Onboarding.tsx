import { Moon } from 'lucide-react';
import AddChildForm from '../components/AddChildForm';

/** First-run experience: welcome + add the first child. */
export default function Onboarding() {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center px-6 py-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
          <Moon size={32} />
        </div>
        <h1 className="text-2xl font-bold text-slate-800">Welcome to BabyApp</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Track sleep, feeds, diapers and growth. It works fully offline on this
          device — connect sync in Settings to share across caregivers and phones.
        </p>
      </div>
      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Add your first baby</h2>
        <AddChildForm onDone={() => {}} />
      </div>
    </div>
  );
}
