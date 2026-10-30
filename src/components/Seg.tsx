export interface SegOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: SegOption[];
}

/** Compact segmented control for small sets of choices. */
export default function Seg({ value, onChange, options }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition ${
            value === o.value
              ? 'bg-brand-600 text-white ring-brand-600'
              : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
