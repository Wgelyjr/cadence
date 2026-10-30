import EventForm from './EventForm';
import Modal from './Modal';
import type { CareEvent } from '../lib/types';

interface Props {
  event: CareEvent | null;
  onClose: () => void;
}

/** Sheet for editing a logged entry — the log form, prefilled. */
export default function EditEventModal({ event, onClose }: Props) {
  return (
    <Modal open={!!event} title="Edit entry" onClose={onClose}>
      {event && <EventForm key={event.id} initial={event} onSaved={onClose} />}
    </Modal>
  );
}
