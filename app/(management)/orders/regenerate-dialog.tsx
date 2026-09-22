import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export function RegenerateDialog({
  busy,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title="Regenerate this draft?" onClose={onClose}>
      <p className="mb-6 text-sm text-text">
        This recalculates every line. Any suggested quantities you changed by hand will be reset. Approved drafts
        are never affected.
      </p>
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onClose} className="flex-1" disabled={busy}>
          Cancel
        </Button>
        <Button type="button" loading={busy} onClick={onConfirm} className="flex-1">
          Regenerate
        </Button>
      </div>
    </Modal>
  );
}
