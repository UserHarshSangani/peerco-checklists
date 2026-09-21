import { Table, TableHead, TableBody, Th, Td } from "@/components/ui/table";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { STATUS_CONFIG, sortOutletsBySeverity } from "./outlet-status";
import type { OverviewOutlet } from "./types";

export function OutletTable({
  outlets,
  isAdmin,
  onSelectOutlet,
}: {
  outlets: OverviewOutlet[];
  isAdmin: boolean;
  onSelectOutlet: (outletId: string) => void;
}) {
  if (outlets.length === 0) {
    return <EmptyState title="No outlets to show." />;
  }

  const sorted = sortOutletsBySeverity(outlets);

  return (
    <Table>
      <TableHead>
        <tr>
          <Th>#</Th>
          <Th>Outlet</Th>
          <Th>Completion</Th>
          <Th>Missed items</Th>
          <Th>Overdue</Th>
          <Th>Status</Th>
        </tr>
      </TableHead>
      <TableBody>
        {sorted.map((outlet, index) => {
          const status = STATUS_CONFIG[outlet.status];
          const StatusIcon = status.icon;
          return (
            <tr
              key={outlet.outlet_id}
              onClick={() => onSelectOutlet(outlet.outlet_id)}
              className="cursor-pointer hover:bg-border/20"
            >
              <Td className="whitespace-nowrap">{index + 1}</Td>
              <Td className="whitespace-nowrap">
                <p className="font-medium">{outlet.name}</p>
                {isAdmin && <p className="text-xs text-muted">{outlet.brand}</p>}
              </Td>
              <Td className="whitespace-nowrap">
                {outlet.completion_pct == null ? "—" : `${outlet.completion_pct}%`}
              </Td>
              <Td className="whitespace-nowrap">{outlet.missed_items}</Td>
              <Td className="whitespace-nowrap">{outlet.overdue}</Td>
              <Td className="whitespace-nowrap">
                <StatusPill tone={status.tone} icon={<StatusIcon className="h-full w-full" />}>
                  {status.label}
                </StatusPill>
              </Td>
            </tr>
          );
        })}
      </TableBody>
    </Table>
  );
}
