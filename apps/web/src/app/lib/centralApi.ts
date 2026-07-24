// Thin client for the Nexura central server (central-server/) -- Phase 3.
// Separate from lib/api.ts's local-server client: this is a genuinely
// different service, on a different port, with its own auth (Org Portal /
// Platform Admin Console sessions, not a branch staff login). See
// Auth doc Parts 3-4 and ROADMAP.md's Phase 3 entry.
const CENTRAL_API_BASE = (import.meta as any).env?.VITE_CENTRAL_API_BASE_URL ?? "http://localhost:5000";

export class CentralApiError extends Error {
  status: number; code: string; body: Record<string, unknown>;
  constructor(status: number, code: string, body: Record<string, unknown> = {}) { super(code); this.status = status; this.code = code; this.body = body; }
}
export class CentralNetworkError extends Error {}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${CENTRAL_API_BASE}${path}`, {
      ...options, credentials: "include",
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw new CentralNetworkError(`Could not reach the central server at ${CENTRAL_API_BASE}`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new CentralApiError(res.status, body.error ?? "UNKNOWN_ERROR", body);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const central = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
};

export interface OrgUser { id: string; email: string; firstName: string; lastName: string; organizationId: string; organizationName?: string }
export interface AdminUser { id: string; email: string; firstName: string; lastName: string }

export const orgAuthApi = {
  login: (email: string, password: string) => central.post<{ user: OrgUser }>("/auth/org/login", { email, password }),
  logout: () => central.post<{ ok: true }>("/auth/org/logout"),
  me: () => central.get<OrgUser>("/auth/org/me"),
};
export const adminAuthApi = {
  // Auth doc 3.5: TOTP is mandatory, no bypass -- login never returns a
  // session by itself, only whether MFA verification or first-time
  // enrollment comes next. See routes/auth.ts.
  login: (email: string, password: string) => central.post<{ mfaRequired: true; setupRequired: boolean }>("/auth/admin/login", { email, password }),
  mfaEnrollStart: () => central.post<{ secret: string; otpauthUrl: string }>("/auth/admin/mfa/enroll/start"),
  mfaEnrollConfirm: (code: string) => central.post<{ user: AdminUser }>("/auth/admin/mfa/enroll/confirm", { code }),
  mfaVerify: (code: string) => central.post<{ user: AdminUser }>("/auth/admin/mfa/verify", { code }),
  logout: () => central.post<{ ok: true }>("/auth/admin/logout"),
  me: () => central.get<AdminUser>("/auth/admin/me"),
};

export interface OrgBranchCard {
  branchId: string; branchName: string; lastSyncAt: string | null; lastSyncStatus: string;
  occupancyRate: number | null; revenueToday: number | null; activeGuests: number | null; openIssues: number | null;
  roomsTotal: number | null; branchManagerName: string | null; snapshotAt: string | null;
}
export interface OrgOverview {
  organizationName: string; planTier: string; totalBranches: number; avgOccupancy: number;
  totalRevenueToday: number; totalActiveGuests: number; totalOpenIssues: number; branches: OrgBranchCard[];
}
export interface BranchHistoryPoint { syncedAt: string; occupancyRate: number; revenueToday: number; adr: number; revpar: number }
export interface OrgComparison { branches: Array<{ branchId: string; branchName: string; history: BranchHistoryPoint[] }> }
export interface OrgSyncStatusEntry { branchId: string; branchName: string; lastSyncAt: string | null; lastSyncStatus: string; lastSyncError: string | null }

export const orgPortalApi = {
  overview: () => central.get<OrgOverview>("/org/overview"),
  comparison: (limit?: number) => central.get<OrgComparison>(`/org/comparison${limit ? `?limit=${limit}` : ""}`),
  syncStatus: () => central.get<OrgSyncStatusEntry[]>("/org/sync-status"),
};

export interface OrganizationSummary {
  id: string; name: string; planTier: string; billingStatus: string; enabledModules: string[]; branchCount: number; lastSyncAt: string | null;
}
export interface OrganizationDetail extends Omit<OrganizationSummary, "branchCount"> {
  branches: Array<{ id: string; name: string; lastSyncAt: string | null; lastSyncStatus: string }>;
  admins: Array<{ id: string; email: string; firstName: string; lastName: string }>;
}
export interface PlatformAuditEntry { id: string; actorType: string; actorId: string | null; branchId: string | null; action: string; details: string | null; createdAt: string }

export interface AllBranchesEntry {
  id: string; name: string; organizationId: string; organizationName: string;
  lastSyncAt: string | null; lastSyncStatus: string; lastSyncError: string | null;
  // Distribution (Auth/Distribution doc Part 11) -- see central-server/src/routes/organizations.ts.
  currentVersion: string | null; lastUpdateCheckAt: string | null; lastUpdateStatus: string | null;
  updateChannel: string | null; forceUpdateRequestedAt: string | null; rollbackToVersion: string | null;
}

export const platformApi = {
  listOrganizations: () => central.get<OrganizationSummary[]>("/organizations"),
  listAllBranches: () => central.get<AllBranchesEntry[]>("/organizations/branches/all"),
  forceUpdateBranch: (branchId: string) => central.post<{ ok: true }>(`/organizations/branches/${branchId}/force-update`),
  rollbackBranch: (branchId: string, version: string) => central.post<{ ok: true }>(`/organizations/branches/${branchId}/rollback`, { version }),
  setBranchChannel: (branchId: string, channel: "stable" | "beta") => central.post<{ ok: true }>(`/organizations/branches/${branchId}/channel`, { channel }),
  createOrganization: (input: { name: string; planTier?: "starter" | "growth" | "business"; adminEmail: string; adminFirstName: string; adminLastName: string }) =>
    central.post<{ organizationId: string; superAdmin: { id: string; email: string; tempPassword: string } }>("/organizations", input),
  getOrganization: (id: string) => central.get<OrganizationDetail>(`/organizations/${id}`),
  setBillingStatus: (id: string, billingStatus: "current" | "overdue" | "suspended") => central.post<{ ok: true }>(`/organizations/${id}/billing-status`, { billingStatus }),
  setModules: (id: string, enabledModules: string[]) => central.post<{ ok: true }>(`/organizations/${id}/modules`, { enabledModules }),
  provisionBranch: (id: string, name: string) => central.post<{ id: string; name: string; syncKey: string }>(`/organizations/${id}/branches`, { name }),
  orgAuditLog: (id: string) => central.get<PlatformAuditEntry[]>(`/organizations/${id}/audit-log`),
};
