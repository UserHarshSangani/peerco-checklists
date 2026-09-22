"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UserPlus2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { NewClientModal } from "./new-client-modal";
import { AddOutletModal } from "./add-outlet-modal";
import { CreateLoginModal } from "./create-login-modal";
import type { BrandRow, CreatableRole, OutletOption } from "./types";

type LoginTarget = {
  organizationId: string;
  organizationName: string;
  outlets: OutletOption[];
  defaultRole?: CreatableRole;
  defaultOutletIds?: string[];
};

export default function AdminClientsPage() {
  const { showError } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [addOutletFor, setAddOutletFor] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [loginTarget, setLoginTarget] = useState<LoginTarget | null>(null);

  const refresh = useCallback(() => {
    return Promise.all([
      supabase.from("organizations").select("id, name").order("name"),
      supabase.from("outlets").select("id, name, organization_id").order("name"),
      supabase.from("profiles").select("id, organization_id").not("organization_id", "is", null),
    ]).then(([orgsRes, outletsRes, profilesRes]) => {
      const firstError = orgsRes.error ?? outletsRes.error ?? profilesRes.error;
      if (firstError) {
        setLoadError(firstError.message);
        setLoading(false);
        return;
      }
      setLoadError(null);

      const outletsByOrg = new Map<string, OutletOption[]>();
      for (const outlet of outletsRes.data ?? []) {
        const list = outletsByOrg.get(outlet.organization_id) ?? [];
        list.push({ id: outlet.id, name: outlet.name });
        outletsByOrg.set(outlet.organization_id, list);
      }

      const loginCountByOrg = new Map<string, number>();
      for (const profile of profilesRes.data ?? []) {
        if (!profile.organization_id) continue;
        loginCountByOrg.set(
          profile.organization_id,
          (loginCountByOrg.get(profile.organization_id) ?? 0) + 1,
        );
      }

      setBrands(
        (orgsRes.data ?? []).map((org) => {
          const outlets = outletsByOrg.get(org.id) ?? [];
          return {
            id: org.id,
            name: org.name,
            outletCount: outlets.length,
            loginCount: loginCountByOrg.get(org.id) ?? 0,
            outlets,
          };
        }),
      );
      setLoading(false);
    });
  }, [supabase]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  return (
    <main className="flex-1 p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-serif text-xl font-bold text-text">Clients</h2>
        <Button type="button" onClick={() => setShowNewClient(true)}>
          New client
        </Button>
      </div>

      {loading && <SkeletonList rows={3} rowClassName="h-20" />}
      {loadError && (
        <p className="text-danger">Couldn&apos;t load clients: {loadError}</p>
      )}
      {!loading && !loadError && brands.length === 0 && (
        <EmptyState
          title="No clients yet"
          description="Create your first brand to get started."
        />
      )}

      {!loading && !loadError && brands.length > 0 && (
        <div className="flex flex-col gap-3">
          {brands.map((brand) => (
            <Card key={brand.id} className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-base font-semibold text-text">{brand.name}</p>
                <p className="text-sm text-muted">
                  {brand.outletCount} outlet{brand.outletCount === 1 ? "" : "s"} ·{" "}
                  {brand.loginCount} login{brand.loginCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAddOutletFor({ id: brand.id, name: brand.name })}
                >
                  Add outlet
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setLoginTarget({
                      organizationId: brand.id,
                      organizationName: brand.name,
                      outlets: brand.outlets,
                    })
                  }
                >
                  <UserPlus2 className="h-4 w-4" aria-hidden="true" />
                  Add login
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showNewClient && (
        <NewClientModal
          onClose={() => setShowNewClient(false)}
          onCreated={(org, outlet) => {
            setShowNewClient(false);
            refresh().catch(() => showError("Couldn't refresh the client list."));
            setLoginTarget({
              organizationId: org.id,
              organizationName: org.name,
              outlets: [{ id: outlet.id, name: outlet.name }],
              defaultRole: "owner",
            });
          }}
        />
      )}

      {addOutletFor && (
        <AddOutletModal
          organizationId={addOutletFor.id}
          organizationName={addOutletFor.name}
          onClose={() => setAddOutletFor(null)}
          onCreated={() => {
            refresh().catch(() => showError("Couldn't refresh the client list."));
          }}
        />
      )}

      {loginTarget && (
        <CreateLoginModal
          organizationId={loginTarget.organizationId}
          organizationName={loginTarget.organizationName}
          outlets={loginTarget.outlets}
          defaultRole={loginTarget.defaultRole}
          defaultOutletIds={loginTarget.defaultOutletIds}
          onClose={() => setLoginTarget(null)}
          onCreated={() => {
            refresh().catch(() => showError("Couldn't refresh the client list."));
          }}
        />
      )}
    </main>
  );
}
