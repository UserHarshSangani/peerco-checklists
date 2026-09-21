const ROLE_HOME: Record<string, string> = {
  device: "/tablet",
  peerco_admin: "/dashboard",
  manager: "/dashboard",
  owner: "/dashboard",
};

export function homeForRole(role: string | null | undefined): string {
  return (role && ROLE_HOME[role]) || "/tablet";
}

export function isManagementRole(role: string | null | undefined): boolean {
  return role === "peerco_admin" || role === "owner" || role === "manager";
}

// Only these two roles can view/edit outlet locations — outlets RLS itself
// enforces this for writes, this is just for the UI (nav link, page gate).
export function isOutletAdminRole(role: string | null | undefined): boolean {
  return role === "peerco_admin" || role === "owner";
}
