"use client";

import { useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export function NewClientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (
    organization: { id: string; name: string },
    outlet: { id: string; name: string },
  ) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [brandName, setBrandName] = useState("");
  const [outletName, setOutletName] = useState("");
  const [city, setCity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!brandName.trim()) {
      setError("Brand name is required.");
      return;
    }
    if (!outletName.trim()) {
      setError("First outlet name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({ name: brandName.trim() })
      .select("id, name")
      .single();

    if (orgError || !org) {
      setSubmitting(false);
      setError(orgError?.message ?? "Couldn't create the brand.");
      return;
    }

    const { data: outlet, error: outletError } = await supabase
      .from("outlets")
      .insert({
        organization_id: org.id,
        name: outletName.trim(),
        city: city.trim() || null,
      })
      .select("id, name")
      .single();

    setSubmitting(false);

    if (outletError || !outlet) {
      setError(outletError?.message ?? "Couldn't create the first outlet.");
      return;
    }

    onCreated(org, outlet);
  }

  return (
    <Modal onClose={onClose} title="New client">
      <form onSubmit={handleSubmit}>
        <label className="mb-1 block text-sm font-medium text-muted">
          Brand name
        </label>
        <input
          type="text"
          value={brandName}
          onChange={(event) => setBrandName(event.target.value)}
          autoFocus
          className="mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
        />

        <label className="mb-1 block text-sm font-medium text-muted">
          First outlet name
        </label>
        <input
          type="text"
          value={outletName}
          onChange={(event) => setOutletName(event.target.value)}
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
            {submitting ? "Creating…" : "Create brand"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
