"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { CreatableRole, OutletOption } from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_LABELS: Record<CreatableRole, string> = {
  owner: "Owner",
  manager: "Manager",
  device: "Tablet device",
};

type CreatedAccount = {
  email: string;
  temporary_password: string;
};

export function CreateLoginModal({
  organizationId,
  organizationName,
  outlets,
  defaultRole = "owner",
  defaultOutletIds = [],
  onClose,
  onCreated,
}: {
  organizationId: string;
  organizationName: string;
  outlets: OutletOption[];
  defaultRole?: CreatableRole;
  defaultOutletIds?: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { showSuccess, showError } = useToast();
  const [role, setRole] = useState<CreatableRole>(defaultRole);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedOutletIds, setSelectedOutletIds] = useState<Set<string>>(
    new Set(defaultOutletIds),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedAccount | null>(null);

  const needsOutlets = role === "manager" || role === "device";

  function toggleOutlet(outletId: string) {
    setSelectedOutletIds((prev) => {
      const next = new Set(prev);
      if (next.has(outletId)) next.delete(outletId);
      else next.add(outletId);
      return next;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (needsOutlets && selectedOutletIds.size === 0) {
      setError("Select at least one outlet.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/create-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          full_name: fullName.trim(),
          email: email.trim(),
          organization_id: organizationId,
          outlet_ids: needsOutlets ? Array.from(selectedOutletIds) : [],
        }),
      });
      const data = await response.json();
      setSubmitting(false);

      if (!data.ok) {
        setError(
          data.reason === "email_exists"
            ? "An account with this email already exists."
            : (data.message ?? "Something went wrong. Please try again."),
        );
        return;
      }
      setCreated({ email: data.email, temporary_password: data.temporary_password });
    } catch {
      setSubmitting(false);
      setError("Something went wrong. Please try again.");
    }
  }

  async function copyBoth() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(
        `Email: ${created.email}\nTemporary password: ${created.temporary_password}`,
      );
      showSuccess("Copied.");
    } catch {
      showError("Couldn't copy to the clipboard.");
    }
  }

  function handleDone() {
    onCreated();
    onClose();
  }

  if (created) {
    return (
      <Modal onClose={handleDone} title="Account created">
        <p className="mb-4 text-sm text-text">
          Account created. Share these details with {fullName} — they&apos;ll
          need to change this password after logging in:
        </p>
        <div className="mb-2 rounded-xl bg-bg p-4 font-mono text-sm text-text">
          <p className="break-all">Email: {created.email}</p>
          <p className="break-all">
            Temporary password: {created.temporary_password}
          </p>
        </div>
        <p className="mb-4 text-xs text-muted">
          This is shown once and won&apos;t be retrievable again — copy or
          share it now.
        </p>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" onClick={copyBoth} className="flex-1">
            Copy both
          </Button>
          <Button type="button" onClick={handleDone} className="flex-1">
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title={`Create login — ${organizationName}`}>
      <form onSubmit={handleSubmit}>
        <label className="mb-1 block text-sm font-medium text-muted">Role</label>
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as CreatableRole)}
          className="mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
        >
          {(["owner", "manager", "device"] as CreatableRole[]).map((value) => (
            <option key={value} value={value}>
              {ROLE_LABELS[value]}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-muted">Full name</label>
        <input
          type="text"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          autoFocus
          className="mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
        />

        <label className="mb-1 block text-sm font-medium text-muted">Email</label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none"
        />

        {needsOutlets && (
          <div className="mb-4">
            <p className="mb-2 text-sm font-medium text-muted">
              Outlets (at least one)
            </p>
            {outlets.length === 0 ? (
              <p className="text-sm text-muted">
                This brand has no outlets yet — add one first.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {outlets.map((outlet) => {
                  const on = selectedOutletIds.has(outlet.id);
                  return (
                    <button
                      key={outlet.id}
                      type="button"
                      onClick={() => toggleOutlet(outlet.id)}
                      className={`min-h-[40px] rounded-full px-4 py-2 text-sm font-medium ring-1 ring-border ${
                        on ? "bg-accent text-accent-fg" : "bg-bg text-text"
                      }`}
                    >
                      {outlet.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {error && <p className="mb-4 text-sm font-medium text-danger">{error}</p>}

        <div className="flex gap-3">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" loading={submitting} className="flex-1">
            {submitting ? "Creating…" : "Create login"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
