"use client";

import { useState } from "react";
import { ClipboardCheck, Package, Trash2, Truck, type LucideIcon } from "lucide-react";
import { formatTime12Kolkata } from "@/lib/date";
import { IconCircle, type IconTone } from "@/components/ui/icon-circle";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import type { OverviewActivity, OverviewActivityType } from "./types";

const TYPE_ICON: Record<OverviewActivityType, LucideIcon> = {
  checklist: ClipboardCheck,
  stock_count: Package,
  receipt: Truck,
  wastage: Trash2,
};

const TYPE_TONE: Record<OverviewActivityType, IconTone> = {
  checklist: "success",
  stock_count: "info",
  receipt: "accent",
  wastage: "warning",
};

function activityText(activity: OverviewActivity): string {
  switch (activity.type) {
    case "checklist":
      return `${activity.staff} submitted ${activity.title}`;
    case "stock_count":
      return `${activity.staff} completed ${activity.title}`;
    case "receipt":
      return `${activity.staff} received goods from ${activity.title}`;
    case "wastage":
      return `${activity.staff} logged wastage: ${activity.title}${
        activity.detail ? ` (${activity.detail})` : ""
      }`;
  }
}

export function ActivityFeed({
  activity,
  photoUrls,
}: {
  activity: OverviewActivity[];
  photoUrls: Record<string, string>;
}) {
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  if (activity.length === 0) {
    return <EmptyState title="No activity yet for this date." />;
  }

  return (
    <>
      <ul className="flex flex-col gap-4">
        {activity.map((entry) => {
          const Icon = TYPE_ICON[entry.type];
          const photos = entry.photos.map((path) => photoUrls[path]).filter(Boolean);
          const extraPhotos = entry.photos.length - photos.length;
          return (
            <li key={`${entry.type}-${entry.id}`} className="flex gap-3">
              <IconCircle icon={<Icon className="h-full w-full" />} tone={TYPE_TONE[entry.type]} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">{activityText(entry)}</p>
                <p className="text-xs text-muted">
                  {entry.outlet} · {formatTime12Kolkata(entry.ts)}
                </p>
                {entry.type === "checklist" && (
                  <p className="text-xs text-muted">
                    {entry.items_done} of {entry.items_total} items completed ·{" "}
                    {entry.photo_count ?? 0} photo proof{entry.photo_count === 1 ? "" : "s"}
                  </p>
                )}
                {entry.location_status === "outside" && (
                  <StatusPill tone="warning" className="mt-1">
                    Outside outlet
                  </StatusPill>
                )}
                {photos.length > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    {photos.slice(0, 3).map((url, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setViewerUrl(url)}
                        aria-label="View photo"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not an optimizable static asset */}
                        <img
                          src={url}
                          alt=""
                          className="h-12 w-12 rounded-lg object-cover ring-1 ring-border transition hover:opacity-80"
                        />
                      </button>
                    ))}
                    {(photos.length > 3 || extraPhotos > 0) && (
                      <span className="text-xs font-medium text-muted">
                        +{Math.max(photos.length - 3, 0) + extraPhotos}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {viewerUrl && (
        <Modal
          onClose={() => setViewerUrl(null)}
          panelClassName="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-surface p-2 shadow-xl outline-none"
        >
          <div className="flex justify-end p-2">
            <button
              type="button"
              onClick={() => setViewerUrl(null)}
              className="min-h-[40px] text-sm font-medium text-muted hover:text-text"
            >
              Close
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not an optimizable static asset */}
          <img
            src={viewerUrl}
            alt=""
            className="max-h-[75vh] w-full rounded-2xl object-contain"
          />
        </Modal>
      )}
    </>
  );
}
