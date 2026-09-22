"use client";

import { useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export function AddOutletModal({
  organizationId,
  organizationName,
  onClose,
  onCreated,
}: {
  organizationId: string;
  organizationName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Outlet name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const { error: insertError } = await supabase.from("outlets").insert({
      organization_id: organizationId,
      name: name.trim(),
      city: city.trim() || null,
    });
    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }
    onCreated();
    onClose();
  }

  return (
    <Modal onClose={onClose} title={`Add outlet to ${organizationName}`}>
      <form onSubmit={handleSubmit}>
        <label className="mb-1 block text-sm font-medium text-muted">
          Outlet name
        </label>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
          className="mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
        />

        <label className="mb-1 block text-sm font-medium text-muted">
          City
        </label>
        <input
          type="text"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
        />

        {error && <p className="mb-4 text-sm font-medium text-danger">{error}</p>}

        <div className="flex gap-3">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" loading={submitting} className="flex-1">
            {submitting ? "Adding…" : "Add outlet"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
