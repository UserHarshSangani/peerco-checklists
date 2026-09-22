import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export function DismissDialog({
  busy,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <Modal title="Dismiss this draft?" onClose={onClose}>
      <p className="mb-3 text-sm text-text">
        This discards the draft. It stays in history, but nothing on it can be ordered from here anymore.
      </p>
      <label className="mb-6 block text-sm font-medium text-muted">
        Reason (optional)
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          placeholder="e.g. Duplicate, ordered another way"
          className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-base text-text placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </label>
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onClose} className="flex-1" disabled={busy}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          loading={busy}
          onClick={() => onConfirm(reason.trim())}
          className="flex-1"
        >
          Dismiss draft
        </Button>
      </div>
    </Modal>
  );
}
