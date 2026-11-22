import { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

export function FinishDateDialog({ onCancel, onMove }: {
  onCancel(): void;
  onMove(date: Date): Promise<void>;
}) {
  const [date, setDate] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <ConfirmDialog open title="When did you finish this book?" confirmLabel="Move to Read"
      busy={busy} confirmDisabled={!date} onCancel={onCancel}
      onConfirm={async () => {
        if (!date || busy) return;
        setBusy(true);
        setFailed(false);
        try {
          await onMove(new Date(`${date}T12:00:00`));
        } catch {
          setFailed(true);
        } finally {
          setBusy(false);
        }
      }}>
      <label>Finished on <input type="date" value={date} disabled={busy} onChange={(event) => setDate(event.target.value)} /></label>
      {failed && <p role="alert">Couldn’t move this book. Please try again.</p>}
    </ConfirmDialog>
  );
}
