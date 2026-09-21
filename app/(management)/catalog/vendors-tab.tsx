"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import { useToast } from "@/components/ui/toast";
import type { Vendor } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { VendorModal } from "./vendor-modal";

function isDuplicateNameError(message: string): boolean {
  return message.toLowerCase().includes("duplicate key");
}

export function VendorsTab({ organizationId }: { organizationId: string }) {
  const { t } = useLanguage();
  const { showError } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalVendor, setModalVendor] = useState<Vendor | "new" | null>(null);

  async function fetchVendors() {
    return supabase
      .from("vendors")
      .select("id, name, phone, notes, active")
      .eq("organization_id", organizationId)
      .order("name");
  }

  async function refresh() {
    const { data, error } = await fetchVendors();
    if (error) {
      showError(error.message);
      return;
    }
    setVendors(data ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    fetchVendors().then(({ data, error }) => {
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setLoadError(error.message);
        return;
      }
      setVendors(data ?? []);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  async function handleSubmit(
    existing: Vendor | null,
    values: { name: string; phone: string; notes: string; active: boolean },
  ): Promise<{ error: string | null }> {
    const payload = {
      name: values.name,
      phone: values.phone || null,
      notes: values.notes || null,
      active: values.active,
    };
    const { error } = existing
      ? await supabase.from("vendors").update(payload).eq("id", existing.id)
      : await supabase
          .from("vendors")
          .insert({ ...payload, organization_id: organizationId });
    if (error) {
      return {
        error: isDuplicateNameError(error.message)
          ? t("catalog.duplicateVendorName")
          : error.message,
      };
    }
    await refresh();
    return { error: null };
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button type="button" onClick={() => setModalVendor("new")}>
          {t("catalog.addVendor")}
        </Button>
      </div>

      {loading && <SkeletonList rows={3} rowClassName="h-16" />}
      {loadError && (
        <p className="text-danger">
          {t("catalog.loadVendorsError", { error: loadError })}
        </p>
      )}
      {!loading && !loadError && vendors.length === 0 && (
        <EmptyState title={t("catalog.noVendorsYet")} />
      )}

      <ul className="flex flex-col gap-3">
        {vendors.map((vendor) => (
          <li
            key={vendor.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border"
          >
            <div>
              <p className="text-base font-medium text-text">{vendor.name}</p>
              {vendor.phone && (
                <p className="text-sm text-muted">{vendor.phone}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!vendor.active && (
                <span className="rounded-full bg-border/50 px-3 py-1 text-xs font-semibold text-muted">
                  {t("manager.inactive")}
                </span>
              )}
              <button
                type="button"
                onClick={() => setModalVendor(vendor)}
                className="min-h-[40px] rounded-full px-4 py-2 text-sm font-medium text-muted hover:bg-border/40 hover:text-text"
              >
                {t("manager.edit")}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {modalVendor && (
        <VendorModal
          vendor={modalVendor === "new" ? null : modalVendor}
          onSubmit={(values) =>
            handleSubmit(modalVendor === "new" ? null : modalVendor, values)
          }
          onClose={() => setModalVendor(null)}
        />
      )}
    </div>
  );
}
