import EventForm from '../components/EventForm';

export default function Log() {
  return (
    <div className="animate-fade-in space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-800">Log care</h1>
        <p className="text-sm text-slate-500">
          Pick a type, use the timer or set times, then save.
        </p>
      </div>
      <EventForm />
    </div>
  );
}
