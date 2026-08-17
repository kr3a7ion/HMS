// Thin client for the Nexura local server (server/). Every call sends
// credentials so the httpOnly session cookie set by /auth/login travels
// with it — see server/src/auth for what's actually enforced server-side.
// Nothing here should ever hold a JWT in JS-readable storage.
import { reportReachable, reportUnreachable } from "./connection";

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, details?: unknown) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Thrown when the request never reached the server at all (LAN/local server unreachable). */
export class NetworkError extends Error {}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    // This request never reached the server. That is the ONLY trustworthy
    // signal that the property is offline -- navigator.onLine reports the OS
    // interface, which stays "online" when the LAN is fine but the local
    // server has stopped, the exact case staff actually hit.
    reportUnreachable();
    throw new NetworkError(`Could not reach the local server at ${API_BASE}`);
  }
  // Reached the server. A 4xx/5xx still proves reachability, so this is
  // recorded before the status check, not after.
  reportReachable();

  if (!res.ok) {
    let body: any = {};
    try { body = await res.json(); } catch { /* no JSON body */ }
    throw new ApiError(res.status, body.error ?? "UNKNOWN_ERROR", body);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Cursor pagination, mirroring server/src/lib/pagination.ts. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** A page of reservations, plus the trading day it was computed against. */
export type ReservationPage = Page<EnrichedReservation> & { businessDate: string };

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const pairs = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  return pairs.length ? `?${pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}` : "";
}

// ─── Types (mirror server/src/db/schema.ts) ────────────────────────────────
export interface AuthUser {
  id: string; email: string; role: string;
  firstName: string; lastName: string;
  branchId: string; organizationId: string;
  /**
   * The role's effective permission keys, or "*" for full access. Supplied by
   * GET /auth/me so <RoleGate> can hide actions the server would refuse.
   *
   * Optional because a cached session from before this field existed will not
   * have it. Treat a missing value as "no permissions known" and fall back to
   * showing the action — the server still enforces, so the worst case is a
   * 403 the user can see, not an action they shouldn't have.
   */
  permissions?: string[] | "*";
}

export interface Room {
  id: string; branchId: string; number: string; type: string; floor: string | null; status: string;
}

export interface HkRoom {
  id: string; number: string; type: string; floor: string | null;
  status: string; housekeepingStatus: "dirty" | "in_progress" | "clean" | "inspected";
  priority: boolean; dnd: boolean;
  assignedAttendantId: string | null; attendantFirstName: string | null; attendantLastName: string | null;
}

export interface StaffUser {
  id: string; firstName: string; lastName: string; role: string; email: string;
}

export interface Guest {
  id: string; branchId: string; firstName: string; lastName: string;
  email: string | null; phone: string | null;
  idType: string | null; idNumber: string | null; nationality: string | null;
  vip: boolean; blacklisted: boolean; notes: string | null; createdAt: string;
}

export interface ReservationListItem {
  id: string; guestId: string; roomId: string | null;
  checkInDate: string; checkOutDate: string; status: string;
  rateKobo: number; adults: number; children: number; specialRequests: string | null;
  guestFirstName: string | null; guestLastName: string | null; roomNumber: string | null;
}

export interface FolioCharge {
  id: string; reservationId: string; category: string; description: string;
  quantity: number; unitPriceKobo: number; amountKobo: number; postedBy: string; postedAt: string;
}

export interface Payment {
  id: string; reservationId: string; amountKobo: number; method: string; receivedBy: string; receivedAt: string;
}

export interface FolioSummary {
  charges: FolioCharge[]; payments: Payment[]; totalChargesKobo: number; totalPaidKobo: number; balanceKobo: number;
}

export interface ReservationDetail {
  id: string; branchId: string; guestId: string; roomId: string | null;
  checkInDate: string; checkOutDate: string; status: string;
  rateKobo: number; adults: number; children: number; specialRequests: string | null;
  createdBy: string; createdAt: string;
  guest: Guest; room: Room | null; folio: FolioSummary;
}

// ─── Auth ───────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ user: AuthUser }>("/auth/login", { email, password }),
  continueOffline: () =>
    api.post<{ offlineExtension: true; expiresInSeconds: number }>("/auth/continue-offline"),
  logout: () => api.post<{ ok: true }>("/auth/logout"),
  me: () => api.get<AuthUser>("/auth/me"),
};

// ─── Front Desk vertical slice ─────────────────────────────────────────────
export const roomsApi = {
  list: () => api.get<Room[]>("/rooms"),
  // B10. One request returns every room with today's arrival, departure and
  // occupant already attached, plus the unassigned arrivals that make this a
  // work queue rather than a status display.
  assignmentBoard: (date?: string) =>
    api.get<AssignmentBoard>(`/rooms/assignment-board${date ? `?date=${encodeURIComponent(date)}` : ""}`),
  assignRoom: (reservationId: string, roomId: string) =>
    api.post<AssignRoomResult>(`/reservations/${reservationId}/assign-room`, { roomId }),
};

export interface GuestStay {
  id: string; checkInDate: string; checkOutDate: string; status: string;
  rateKobo: number; roomNumber: string | null;
}
export interface GuestDetail extends Guest {
  stays: GuestStay[];
  /** Cancellations and no-shows excluded — a booking that never happened is not a stay. */
  totalStays: number;
  lastStayAt: string | null;
  lifetimeValueKobo: number;
}

/**
 * A guest row with the aggregates FD-06's directory needs. Only returned
 * when `withStats` is set: the same endpoint backs New Reservation's
 * type-ahead picker, which fires per keystroke and renders none of this.
 */
export interface GuestWithStats extends Guest {
  totalStays: number;
  lastStayAt: string | null;
  activeStay: boolean;
  balanceKobo: number;
}

export const guestsApi = {
  // `limit` defaults to 20 server-side (right for a type-ahead picker),
  // capped at 200. The directory screen asks for more explicitly.
  list: (params: { search?: string; limit?: number } = {}) =>
    api.get<Guest[]>(`/guests${qs(params)}`),
  listWithStats: (params: { search?: string; limit?: number } = {}) =>
    api.get<GuestWithStats[]>(`/guests${qs({ ...params, withStats: "true" })}`),
  search: (query: string) => api.get<Guest[]>(`/guests?search=${encodeURIComponent(query)}`),
  get: (id: string) => api.get<GuestDetail>(`/guests/${id}`),
  create: (guest: { firstName: string; lastName: string; email?: string; phone?: string }) =>
    api.post<Guest>("/guests", guest),
};

export const usersApi = {
  list: (role?: string) => api.get<StaffUser[]>(`/users${role ? `?role=${encodeURIComponent(role)}` : ""}`),
};

export interface Inspection {
  id: string; roomId: string; result: "pass" | "fail"; notes: string | null; createdAt: string;
  roomNumber: string | null; inspectorFirstName: string | null; inspectorLastName: string | null;
}

export interface LostFoundItem {
  id: string; description: string; locationFound: string | null;
  claimedBy: string | null; status: "held" | "claimed" | "disposed"; disposedReason: string | null;
  createdAt: string; loggedByFirstName: string | null; loggedByLastName: string | null;
}

export interface MenuItem {
  id: string; categoryId: string; name: string; priceKobo: number; available: boolean;
}
export interface MenuCategory {
  id: string; name: string; sortOrder: number; items: MenuItem[];
}
export interface RestaurantTable {
  id: string; label: string; seats: number; status: "available" | "occupied" | "reserved" | "dirty";
}
export interface OrderItem {
  id: string; menuItemId: string; name: string; quantity: number; unitPriceKobo: number; status: "pending" | "ready" | "served";
}
export interface RestaurantOrder {
  id: string; tableId: string | null; roomReservationId: string | null; status: "open" | "sent_to_kitchen" | "served" | "closed";
  createdAt: string; closedAt: string | null; tableLabel?: string | null; items: OrderItem[]; total: number;
}
export interface RoomCharge {
  id: string; reservationId: string; description: string; amountKobo: number; postedAt: string;
  guestFirstName: string | null; guestLastName: string | null; roomNumber: string | null;
}

// ─── Restaurant / POS (RT-01, 02, 03, 04, 07) ──────────────────────────────
export const restaurantApi = {
  getMenu: () => api.get<MenuCategory[]>("/restaurant/menu"),
  createCategory: (name: string) => api.post<{ id: string }>("/restaurant/menu/categories", { name }),
  createItem: (categoryId: string, name: string, priceKobo: number) => api.post<{ id: string }>("/restaurant/menu/items", { categoryId, name, priceKobo }),
  setItemAvailability: (id: string, available: boolean) => api.post<{ ok: true }>(`/restaurant/menu/items/${id}/availability`, { available }),

  listTables: () => api.get<RestaurantTable[]>("/restaurant/tables"),
  setTableStatus: (id: string, status: RestaurantTable["status"]) => api.post<RestaurantTable>(`/restaurant/tables/${id}/status`, { status }),

  listOrders: (status?: string) => api.get<RestaurantOrder[]>(`/restaurant/orders${status ? `?status=${status}` : ""}`),
  createOrder: (input: { tableId?: string; roomReservationId?: string }) => api.post<{ id: string }>("/restaurant/orders", input),
  getOrder: (id: string) => api.get<RestaurantOrder>(`/restaurant/orders/${id}`),
  addItem: (orderId: string, menuItemId: string, quantity = 1) =>
    api.post<{ items: OrderItem[]; total: number }>(`/restaurant/orders/${orderId}/items`, { menuItemId, quantity }),
  sendToKitchen: (orderId: string) => api.post<{ ok: true }>(`/restaurant/orders/${orderId}/send-to-kitchen`),
  setItemStatus: (orderId: string, itemId: string, status: OrderItem["status"]) =>
    api.post<{ ok: true }>(`/restaurant/orders/${orderId}/items/${itemId}/status`, { status }),
  closeOrder: (orderId: string, input: { postToRoom: boolean; paymentMethod?: "cash" | "card" | "transfer" }) =>
    api.post<{ id: string; status: string; total: number }>(`/restaurant/orders/${orderId}/close`, input),

  roomCharges: () => api.get<RoomCharge[]>("/restaurant/room-charges"),
};

export interface ChatChannel {
  id: string; type: "department" | "dm"; name: string | null;
  userAId: string | null; userBId: string | null;
  otherUser: { id: string; firstName: string; lastName: string } | null;
  lastMessage: string | null; lastMessageAt: string | null;
}
export interface ChatMessage {
  id: string; body: string; emergency: boolean; createdAt: string;
  senderId: string; senderFirstName: string | null; senderLastName: string | null;
}

// ─── Internal Chat (CO-01) — polling-based, see chat.ts for why ───────────
export const chatApi = {
  listChannels: () => api.get<ChatChannel[]>("/chat/channels"),
  startDm: (otherUserId: string) => api.post<{ id: string }>("/chat/dm", { otherUserId }),
  listMessages: (channelId: string) => api.get<ChatMessage[]>(`/chat/channels/${channelId}/messages`),
  sendMessage: (channelId: string, body: string, emergency?: boolean) =>
    api.post<{ id: string }>(`/chat/channels/${channelId}/messages`, { body, emergency }),
};

// ─── Guest Messaging (CO-02) — a real communication log, not a WhatsApp/SMS
// sending gateway. See server/src/db/schema.ts's guestMessageThreads
// comment for why: no third-party messaging account exists in this
// codebase, and no guest-facing portal exists for an "internal" message to
// actually be delivered to. `channel` records how the real conversation
// happened (staff's own phone/WhatsApp, in person); this system threads
// and coordinates around it for real.
export type GuestMessageChannel = "whatsapp" | "sms" | "internal";
export type GuestMessageDirection = "to_guest" | "from_guest";
export type GuestThreadStatus = "open" | "forwarded" | "escalated" | "resolved";
export interface InHouseGuestOption {
  guestId: string; firstName: string; lastName: string; roomNumber: string | null; checkOutDate: string;
}
export interface GuestThreadSummary {
  id: string; guestId: string; status: GuestThreadStatus; forwardedToDepartment: string | null;
  escalatedAt: string | null; resolvedAt: string | null; lastMessageAt: string;
  guestFirstName: string; guestLastName: string;
  lastMessagePreview: string | null; lastMessageChannel: GuestMessageChannel | null;
  roomNumber: string | null; inHouse: boolean;
}
export interface GuestMessageEntry {
  id: string; channel: GuestMessageChannel; direction: GuestMessageDirection; body: string; createdAt: string;
  loggedByFirstName: string | null; loggedByLastName: string | null;
}
export interface GuestThreadDetail {
  id: string; guestId: string; status: GuestThreadStatus; forwardedToDepartment: string | null;
  escalatedAt: string | null; resolvedAt: string | null;
  guest: { id: string; firstName: string; lastName: string; vip: boolean; blacklisted: boolean };
  roomNumber: string | null;
  messages: GuestMessageEntry[];
}

export const guestMessagesApi = {
  listInHouse: () => api.get<InHouseGuestOption[]>("/guest-messages/in-house"),
  listThreads: () => api.get<GuestThreadSummary[]>("/guest-messages/threads"),
  getThread: (guestId: string) => api.get<GuestThreadDetail>(`/guest-messages/threads/${guestId}`),
  logMessage: (guestId: string, input: { channel: GuestMessageChannel; direction: GuestMessageDirection; body: string }) =>
    api.post<{ id: string }>(`/guest-messages/threads/${guestId}/messages`, input),
  forward: (guestId: string, department: string) => api.post<{ ok: true }>(`/guest-messages/threads/${guestId}/forward`, { department }),
  escalate: (guestId: string) => api.post<{ ok: true; notifiedManagers: number }>(`/guest-messages/threads/${guestId}/escalate`),
  resolve: (guestId: string) => api.post<{ ok: true }>(`/guest-messages/threads/${guestId}/resolve`),
};

export interface Announcement {
  id: string; title: string; body: string; targetAudience: string;
  expiresAt: string | null; archived: boolean; createdAt: string;
  createdByFirstName: string | null; createdByLastName: string | null;
  readCount: number; totalStaff: number; readByMe: boolean;
}

// ─── Announcements (CO-03) ──────────────────────────────────────────────────
export const announcementsApi = {
  list: (includeArchived = false) => api.get<Announcement[]>(`/announcements${includeArchived ? "?archived=true" : ""}`),
  create: (input: { title: string; body: string; targetAudience: string; expiresAt?: string }) =>
    api.post<{ id: string }>("/announcements", input),
  markRead: (id: string) => api.post<{ ok: true }>(`/announcements/${id}/read`),
  archive: (id: string) => api.post<{ ok: true }>(`/announcements/${id}/archive`),
};

export interface ShiftHandoverListItem {
  id: string; shiftName: string; createdAt: string; acknowledgedAt: string | null;
  outgoingFirstName: string | null; outgoingLastName: string | null;
}
export interface ShiftHandoverDetail {
  id: string; shiftName: string; createdAt: string;
  outstandingTasks: string | null; vipGuests: string | null; maintenanceIssues: string | null;
  guestComplaints: string | null; pendingPayments: string | null; generalNotes: string | null;
  outgoing: { firstName: string; lastName: string } | null;
  acknowledgedAt: string | null; acknowledgedByUser: { firstName: string; lastName: string } | null;
}

// ─── Shift Handover (CO-04) ─────────────────────────────────────────────────
export const shiftHandoverApi = {
  list: () => api.get<ShiftHandoverListItem[]>("/shift-handovers"),
  get: (id: string) => api.get<ShiftHandoverDetail>(`/shift-handovers/${id}`),
  create: (input: { shiftName: string; outstandingTasks?: string; vipGuests?: string; maintenanceIssues?: string; guestComplaints?: string; pendingPayments?: string; generalNotes?: string }) =>
    api.post<{ id: string }>("/shift-handovers", input),
  acknowledge: (id: string) => api.post<{ ok: true }>(`/shift-handovers/${id}/acknowledge`),
};

export interface Product {
  id: string; itemCode: string; name: string; category: string; unit: string;
  currentStock: number; parLevel: number; reorderThreshold: number; unitCostKobo: number;
  location: string | null; updatedAt: string;
}
export interface StockTransaction {
  id: string; type: "in" | "out" | "adjustment"; quantity: number; reference: string | null; createdAt: string;
  productName: string | null; productUnit: string | null;
  loggedByFirstName: string | null; loggedByLastName: string | null;
}
export interface InventoryDashboard {
  totalItems: number; lowStockCount: number; totalValue: number;
  lowStockItems: Product[]; recentTransactions: Array<{ id: string; type: string; quantity: number; createdAt: string; productName: string | null }>;
}
export interface Supplier {
  id: string; name: string; contact: string | null; phone: string | null;
  category: string | null; paymentTerms: string | null; lastOrderDate: string | null;
}
export interface PurchaseOrderListItem {
  id: string; poNumber: string; status: "draft" | "sent" | "received" | "cancelled";
  createdAt: string; sentAt: string | null; receivedAt: string | null;
  supplierName: string | null; itemCount: number; total: number;
}
export interface PurchaseOrderDetail extends PurchaseOrderListItem {
  supplier: Supplier | null;
  items: Array<{ id: string; quantity: number; unitCostKobo: number; productId: string; productName: string | null; productUnit: string | null }>;
}

// ─── Inventory (IV-01..05, HK-06) ───────────────────────────────────────────
export const inventoryApi = {
  listProducts: (category?: string) => api.get<Product[]>(`/inventory/products${category ? `?category=${encodeURIComponent(category)}` : ""}`),
  createProduct: (input: { itemCode: string; name: string; category: string; unit: string; parLevel: number; reorderThreshold: number; unitCostKobo: number; location?: string; initialStock?: number }) =>
    api.post<{ id: string }>("/inventory/products", input),
  adjustProduct: (id: string, input: { type: "in" | "out" | "adjustment"; quantity: number; reference?: string }) =>
    api.post<Product>(`/inventory/products/${id}/adjust`, input),
  productTransactions: (id: string) => api.get<StockTransaction[]>(`/inventory/products/${id}/transactions`),

  transactions: () => api.get<StockTransaction[]>("/inventory/transactions"),
  dashboard: () => api.get<InventoryDashboard>("/inventory/dashboard"),

  listSuppliers: () => api.get<Supplier[]>("/inventory/suppliers"),
  createSupplier: (input: { name: string; contact?: string; phone?: string; category?: string; paymentTerms?: string }) =>
    api.post<{ id: string }>("/inventory/suppliers", input),

  listPurchaseOrders: () => api.get<PurchaseOrderListItem[]>("/inventory/purchase-orders"),
  createPurchaseOrder: (input: { supplierId: string; items: Array<{ productId: string; quantity: number; unitCostKobo: number }> }) =>
    api.post<{ id: string; poNumber: string }>("/inventory/purchase-orders", input),
  getPurchaseOrder: (id: string) => api.get<PurchaseOrderDetail>(`/inventory/purchase-orders/${id}`),
  sendPurchaseOrder: (id: string) => api.post<{ ok: true }>(`/inventory/purchase-orders/${id}/send`),
  receivePurchaseOrder: (id: string) => api.post<{ ok: true }>(`/inventory/purchase-orders/${id}/receive`),
  cancelPurchaseOrder: (id: string) => api.post<{ ok: true }>(`/inventory/purchase-orders/${id}/cancel`),
};

// ─── HR & Staff (HR-01 through HR-06) ───────────────────────────────────────
export interface PermissionKeyDef { key: string; label: string; module: string }
export interface RoleSummary { id: string; name: string; isSystemRole: boolean; permissionCount: number; userCount: number }
export interface RoleDetail {
  id: string; name: string; isSystemRole: boolean; permissions: string[] | "*";
  catalog: PermissionKeyDef[]; users: Array<{ id: string; firstName: string; lastName: string; email: string }>;
}
export interface StaffMember {
  id: string; email: string; role: string; firstName: string; lastName: string; status: string;
  employeeId: string | null; department: string | null; phone: string | null;
  emergencyContactName: string | null; emergencyContactPhone: string | null;
  startDate: string | null; payRateKobo: number | null; contractType: string | null; createdAt: string;
}
export interface StaffDetail extends StaffMember {
  notes: Array<{ id: string; note: string; createdAt: string; createdByFirstName: string | null; createdByLastName: string | null }>;
  upcomingShifts: Array<{ id: string; date: string; shiftType: string }>;
  attendanceSummary: { present: number; absent: number; late: number; leave: number };
}
export interface AttendanceRecord {
  id: string; userId: string; date: string; status: "present" | "absent" | "late" | "leave"; notes: string | null;
}
export interface LeaveRequest {
  id: string; userId: string; startDate: string; endDate: string; reason: string | null;
  status: "pending" | "approved" | "rejected"; requestedAt: string;
}
export interface AttendanceData {
  start: string; end: string; staff: StaffMember[]; records: AttendanceRecord[]; pendingLeave: LeaveRequest[];
}
export interface ShiftRow {
  id: string; userId: string; date: string; shiftType: "Morning" | "Evening" | "Night" | "Off"; published: boolean;
}
export interface ShiftData {
  start: string; end: string; staff: StaffMember[]; shifts: ShiftRow[];
}
export interface PayrollStaffRow {
  id: string; firstName: string; lastName: string; department: string | null;
  baseSalary: number; overtime: number; absentDays: number; deductions: number; net: number;
}
export interface PayrollData {
  period: string; staff: PayrollStaffRow[]; totalGross: number; totalDeductions: number; totalNet: number;
}

export const hrApi = {
  listStaff: (filters?: { department?: string; status?: string }) => {
    const params = new URLSearchParams(filters as Record<string, string>).toString();
    return api.get<StaffMember[]>(`/hr/staff${params ? `?${params}` : ""}`);
  },
  createStaff: (input: { email: string; firstName: string; lastName: string; role: string; department: string; phone?: string; payRateKobo?: number; contractType?: string }) =>
    api.post<{ id: string; employeeId: string; tempPassword: string }>("/hr/staff", input),
  getStaff: (id: string) => api.get<StaffDetail>(`/hr/staff/${id}`),
  updateStaff: (id: string, input: { department?: string; phone?: string; emergencyContactName?: string; emergencyContactPhone?: string; role?: string; contractType?: string }) =>
    api.post<StaffMember>(`/hr/staff/${id}/update`, input),
  deactivateStaff: (id: string) => api.post<{ ok: true }>(`/hr/staff/${id}/deactivate`),
  resetPassword: (id: string) => api.post<{ tempPassword: string }>(`/hr/staff/${id}/reset-password`),
  adjustPayRate: (id: string, payRateKobo: number) => api.post<{ ok: true }>(`/hr/staff/${id}/pay-rate`, { payRateKobo }),
  addNote: (id: string, note: string) => api.post<{ ok: true }>(`/hr/staff/${id}/notes`, { note }),

  attendance: (start?: string, end?: string) => api.get<AttendanceData>(`/hr/attendance${start && end ? `?start=${start}&end=${end}` : ""}`),
  recordAttendance: (input: { userId: string; date: string; status: "present" | "absent" | "late" | "leave"; notes?: string }) =>
    api.post<{ ok: true }>("/hr/attendance", input),
  createLeaveRequest: (input: { userId: string; startDate: string; endDate: string; reason?: string }) =>
    api.post<{ id: string }>("/hr/leave-requests", input),
  decideLeaveRequest: (id: string, decision: "approved" | "rejected") =>
    api.post<{ ok: true }>(`/hr/leave-requests/${id}/decide`, { decision }),

  shifts: (start?: string, end?: string) => api.get<ShiftData>(`/hr/shifts${start && end ? `?start=${start}&end=${end}` : ""}`),
  setShift: (input: { userId: string; date: string; shiftType: "Morning" | "Evening" | "Night" | "Off" }) =>
    api.post<{ ok: true }>("/hr/shifts", input),
  publishShifts: (start: string, end: string) => api.post<{ ok: true; count: number }>("/hr/shifts/publish", { start, end }),
  cloneShifts: (fromStart: string, toStart: string) => api.post<{ ok: true; cloned: number }>("/hr/shifts/clone", { fromStart, toStart }),

  payroll: (period?: string) => api.get<PayrollData>(`/hr/payroll${period ? `?period=${period}` : ""}`),

  // HR-03 Roles & Permissions -- real, DB-backed (server/src/auth/permissionKeys.ts).
  listRoles: () => api.get<RoleSummary[]>("/hr/roles"),
  getRole: (id: string) => api.get<RoleDetail>(`/hr/roles/${id}`),
  createRole: (input: { name: string; permissions: string[] }) => api.post<{ id: string }>("/hr/roles", input),
  updateRolePermissions: (id: string, permissions: string[] | "*") => api.post<{ ok: true }>(`/hr/roles/${id}/permissions`, { permissions }),
  deleteRole: (id: string) => api.delete<{ ok: true }>(`/hr/roles/${id}`),
};

// ─── Reports (RP-01..06) ────────────────────────────────────────────────────
// Every field here is a real aggregation -- see server/src/routes/reports.ts
// and ROADMAP.md for the metric-by-metric list of what's deliberately not
// included (no cost ledger, no loyalty program, no time-clock, etc.).
export interface OccupancyReport {
  start: string; end: string; avgOccupancy: number; noShowRate: number; cancellationRate: number; avgLengthOfStay: number;
  occupancyByDay: Array<{ date: string; occupancy: number }>;
  occupancyByRoomType: Array<{ type: string; occupancy: number }>;
  adrKobo: number; revparKobo: number;
}
export interface RevenueReport {
  start: string; end: string; totalRevenueKobo: number; changeVsPreviousPeriod: number | null;
  revenueByDay: Array<{ date: string; amountKobo: number }>;
  revenueByCategory: Array<{ category: string; amountKobo: number }>;
  adrKobo: number; revparKobo: number;
}
export interface DepartmentReport {
  department: string; start: string; end: string; metrics: Record<string, any>;
}
export interface GuestAnalyticsReport {
  start: string; end: string; repeatGuestRate: number; newGuestRate: number; avgStayDuration: number;
  nationalityBreakdown: Array<{ nationality: string; count: number }>;
  repeatVsNewByMonth: Array<{ month: string; repeat: number; new: number }>;
}
export interface InventoryReport {
  start: string; end: string; totalStockValue: number; criticalItems: number; lowStockItems: number;
  supplierSpend: Array<{ supplier: string; amountKobo: number }>; totalSupplierSpendKobo: number;
  consumptionByCategory: Array<{ category: string; value: number }>;
  stockStatusByCategory: Array<{ category: string; ok: number; low: number; critical: number }>;
}
export interface StaffReport {
  start: string; end: string; totalHoursWorked: number;
  hoursByDepartment: Array<{ department: string; hours: number }>;
  overallAttendanceRate: number | null;
  attendanceByDepartment: Array<{ department: string; rate: number }>;
  unstaffedShiftSlots: number;
}

function rangeQuery(start?: string, end?: string) { return start && end ? `?start=${start}&end=${end}` : ""; }

export const reportsApi = {
  occupancy: (start?: string, end?: string) => api.get<OccupancyReport>(`/reports/occupancy${rangeQuery(start, end)}`),
  revenue: (start?: string, end?: string) => api.get<RevenueReport>(`/reports/revenue${rangeQuery(start, end)}`),
  department: (dept?: string, start?: string, end?: string) => {
    const params = new URLSearchParams({ ...(dept ? { dept } : {}), ...(start && end ? { start, end } : {}) }).toString();
    return api.get<DepartmentReport>(`/reports/department${params ? `?${params}` : ""}`);
  },
  guestAnalytics: (start?: string, end?: string) => api.get<GuestAnalyticsReport>(`/reports/guest-analytics${rangeQuery(start, end)}`),
  inventory: (start?: string, end?: string) => api.get<InventoryReport>(`/reports/inventory${rangeQuery(start, end)}`),
  staff: (start?: string, end?: string) => api.get<StaffReport>(`/reports/staff${rangeQuery(start, end)}`),
};

// ─── IT Admin (IT-01..05) ───────────────────────────────────────────────────
// IT-01 reuses the `users` table (same as HR-02) but with its own
// IT/MGT/ORG-scoped endpoints -- see server/src/routes/admin.ts header.
export interface AdminUser {
  id: string; firstName: string; lastName: string; email: string; role: string;
  department: string | null; status: string; lastLogin: string | null;
}
export interface SystemHealth {
  server: { cpuCount: number; cpuLoad1m: number; memTotalMb: number; memUsedPct: number; uptimeSeconds: number };
  database: { connected: boolean; sizeBytes: number; lastBackupAt: string | null };
  services: Array<{ name: string; status: string; uptimeSeconds: number }>;
}
export interface DiagnosticCheck { name: string; pass: boolean; detail?: string }
export interface DiagnosticsResult { ranAt: string; checks: DiagnosticCheck[] }
export interface ErrorLogEntry { id: string; timestamp: string; method: string; path: string; message: string; stack?: string }
export interface AdminDevice {
  sessionId: string; userId: string; ipAddress: string | null; userAgent: string | null;
  lastActiveAt: string | null; issuedAt: string; revokedAt: string | null;
  userFirstName: string | null; userLastName: string | null; userDepartment: string | null;
  status: "Online" | "Idle" | "Revoked";
}
export interface BackupSnapshot {
  id: string; fileName: string; sizeBytes: number; type: string; status: "completed" | "restore_pending" | "restored";
  createdAt: string; restoredAt: string | null; createdByFirstName: string | null; createdByLastName: string | null;
}
export interface AuditLogEntry {
  id: string; action: string; module: string | null; recordId: string | null; ipAddress: string | null;
  details: string | null; createdAt: string; userFirstName: string | null; userLastName: string | null; userRole: string | null;
}

export const adminApi = {
  listUsers: () => api.get<AdminUser[]>("/admin/users"),
  inviteUser: (input: { email: string; firstName: string; lastName: string; role: string }) =>
    api.post<{ id: string; employeeId: string; tempPassword: string }>("/admin/users", input),
  changeRole: (id: string, role: string) => api.post<{ ok: true }>(`/admin/users/${id}/role`, { role }),
  resetPassword: (id: string) => api.post<{ tempPassword: string }>(`/admin/users/${id}/reset-password`),
  deactivateUser: (id: string) => api.post<{ ok: true }>(`/admin/users/${id}/deactivate`),
  reactivateUser: (id: string) => api.post<{ ok: true }>(`/admin/users/${id}/reactivate`),
  userAuditLog: (id: string) => api.get<AuditLogEntry[]>(`/admin/users/${id}/audit-log`),

  systemHealth: () => api.get<SystemHealth>("/admin/system-health"),
  runDiagnostics: () => api.post<DiagnosticsResult>("/admin/diagnostics"),
  errorLog: () => api.get<ErrorLogEntry[]>("/admin/error-log"),

  listDevices: () => api.get<AdminDevice[]>("/admin/devices"),
  deauthorizeDevice: (sessionId: string) => api.post<{ ok: true }>(`/admin/devices/${sessionId}/deauthorize`),

  listBackups: () => api.get<BackupSnapshot[]>("/admin/backups"),
  createBackup: () => api.post<{ id: string; fileName: string; sizeBytes: number }>("/admin/backups"),
  restoreBackup: (id: string) => api.post<{ ok: true; requiresRestart: boolean; message: string }>(`/admin/backups/${id}/restore`, { confirm: "RESTORE" }),

  auditLog: (filters?: { userId?: string; module?: string; action?: string; dateFrom?: string; dateTo?: string }) => {
    const params = new URLSearchParams(filters as Record<string, string>).toString();
    return api.get<AuditLogEntry[]>(`/admin/audit-log${params ? `?${params}` : ""}`);
  },
};

// ─── Settings (ST-01, 03) ───────────────────────────────────────────────────
// ST-02 Synchronization and ST-04 Door Lock Integration have no real
// endpoints -- both need infrastructure from later phases (central server,
// TTLock). See server/src/routes/settings.ts and ROADMAP.md.
export type ModuleKey = "restaurant" | "inventory" | "multiBranch" | "doorLock";
export interface BranchSettings {
  id: string; name: string; address: string | null; contactPhone: string | null; contactEmail: string | null;
  checkInTime: string; checkOutTime: string; currency: string; timezone: string;
  taxName: string; taxRate: number; taxInclusive: boolean;
  rateRounding: number; discountApprovalThreshold: number; enabledModules: ModuleKey[]; localEnabledModules: ModuleKey[];
}
export interface UserPreferences {
  userId: string; language: string; dateFormat: string; timeFormat: "24h" | "12h";
  notificationPrefs: Record<string, boolean>; updatedAt: string | null;
}

export const settingsApi = {
  getBranch: () => api.get<BranchSettings>("/settings/branch"),
  updateBranch: (input: Partial<Omit<BranchSettings, "id" | "enabledModules">> & { enabledModules?: ModuleKey[] }) =>
    api.post<BranchSettings>("/settings/branch", input),

  getMyPreferences: () => api.get<UserPreferences>("/settings/me"),
  updateMyPreferences: (input: { language?: string; dateFormat?: string; timeFormat?: "24h" | "12h"; notificationPrefs?: Record<string, boolean> }) =>
    api.post<UserPreferences>("/settings/me", input),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ ok: true }>("/auth/change-password", { currentPassword, newPassword }),
};

// ─── Dashboard (D-01, D-02) ─────────────────────────────────────────────────
// Every number here is a real aggregation, reusing the same tables as
// Reports/Inventory/HR -- see server/src/routes/dashboard.ts for which
// Blueprint stat cards have no real backing data and were substituted or
// shown as a structural zero.
export interface DashboardStat { label: string; value: number | string; sub: string; isCurrency?: boolean; isPercent?: boolean }
export interface ActivityEvent {
  type: "charge" | "maintenance" | "restaurant"; time: string; label: string; detail: string;
  refId: string; actor: string; room: string | null;
}
export interface RoleDashboard { role: string; stats: DashboardStat[]; recentActivity: ActivityEvent[] }
export interface ManagementOverview {
  occupancyRate: number; revparKobo: number; inHouseCount: number; arrivalsToday: number; departuresToday: number;
  revenueTodayKobo: number; revenueByCategory: Array<{ category: string; amountKobo: number }>;
  occupancyTrend: Array<{ date: string; occupancy: number }>; revenueTrend: Array<{ date: string; revenueKobo: number }>;
  roomStatus: Array<{ status: string; count: number }>; roomsTotal: number;
  departmentKpis: Array<{ department: string; metric: string; value: number | string; status: "success" | "warning" | "error" }>;
  recentActivity: ActivityEvent[];
}

export const dashboardApi = {
  me: (role?: string) => api.get<RoleDashboard>(`/dashboard/me${role ? `?role=${role}` : ""}`),
  overview: () => api.get<ManagementOverview>("/dashboard/overview"),
};

// ─── Sync (ST-02, Phase 3) ──────────────────────────────────────────────────
// Scoped to KPI-snapshot push/pull against the central server -- not full
// record-level replication with conflict resolution. See
// server/src/routes/sync.ts and ROADMAP.md.
export interface CachedBranch {
  branchId: string; branchName: string; occupancyRate: number | null; revenueTodayKobo: number | null;
  activeGuests: number | null; openIssues: number | null; roomsTotal: number | null; adrKobo: number | null; revparKobo: number | null;
  branchManagerName: string | null; lastSyncAt: string | null; lastSyncStatus: string | null; snapshotAt: string | null; cachedAt: string;
}
export interface SyncStatus {
  configured: boolean; centralServerUrl: string | null;
  lastPushAt: string | null; lastPushStatus: string; lastPushError: string | null;
  lastPullAt: string | null; lastPullStatus: string; lastPullError: string | null;
  centralOrganizationName: string | null; pendingItemCount: number; branches: CachedBranch[];
  deployment: {
    currentVersion: string; updateChannel: string | null; forceUpdateRequested: boolean;
    rollbackToVersion: string | null; lastUpdateCheckAt: string | null;
    lastUpdateStatus: string | null; lastUpdateError: string | null;
  };
}

export const syncApi = {
  status: () => api.get<SyncStatus>("/sync/status"),
  syncNow: () => api.post<{ push: { ok: boolean; error?: string }; pull: { ok: boolean; error?: string } }>("/sync/now"),
};

export interface FinanceFolio {
  id: string; status: string; disputed: boolean;
  checkInDate: string; checkOutDate: string;
  guestFirstName: string | null; guestLastName: string | null; roomNumber: string | null;
  totalChargesKobo: number; totalPaidKobo: number; balanceKobo: number;
  folioStatus: "open" | "closed" | "disputed";
}

export interface DailySummary {
  date: string; totalRevenueKobo: number; transactionCount: number;
  revenueByCategory: Array<{ category: string; amountKobo: number; txn: number }>;
  paymentsByMethod: Array<{ method: string; amountKobo: number }>;
  totalPayments: number; outstandingBalance: number;
}

// ─── Finance (FI-01, FI-03) ─────────────────────────────────────────────────
export const financeApi = {
  listFolios: (params?: { status?: string; minBalance?: boolean; dateFrom?: string; dateTo?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.minBalance) q.set("minBalance", "true");
    if (params?.dateFrom) q.set("dateFrom", params.dateFrom);
    if (params?.dateTo) q.set("dateTo", params.dateTo);
    const qs = q.toString();
    return api.get<FinanceFolio[]>(`/finance/folios${qs ? `?${qs}` : ""}`);
  },
  setDisputed: (id: string, disputed: boolean) => api.post<{ ok: true }>(`/finance/folios/${id}/dispute`, { disputed }),
  dailySummary: (date?: string) => api.get<DailySummary>(`/finance/daily-summary${date ? `?date=${date}` : ""}`),
};

export type WorkOrderStatus = "reported" | "assigned" | "in_progress" | "completed";
export type WorkOrderPriority = "low" | "medium" | "high";

export interface WorkOrderListItem {
  id: string; location: string; category: string; priority: WorkOrderPriority;
  status: WorkOrderStatus; description: string; assignedTechnicianId: string | null;
  createdAt: string; closedAt: string | null;
  technicianFirstName: string | null; technicianLastName: string | null;
}

export interface WorkOrderEvent {
  id: string; eventType: string; note: string | null; createdAt: string;
  performedByFirstName: string | null; performedByLastName: string | null;
}

export interface WorkOrderDetail {
  id: string; branchId: string; location: string; category: string; priority: WorkOrderPriority;
  status: WorkOrderStatus; description: string; assignedTechnicianId: string | null;
  createdBy: string; createdAt: string; closedAt: string | null;
  technician: StaffUser | null; events: WorkOrderEvent[];
}

// ─── Maintenance (MX-01, MX-02, MX-03) ─────────────────────────────────────
export const maintenanceApi = {
  list: () => api.get<WorkOrderListItem[]>("/maintenance/work-orders"),
  create: (input: { location: string; category: string; priority: WorkOrderPriority; description: string }) =>
    api.post<{ id: string }>("/maintenance/work-orders", input),
  get: (id: string) => api.get<WorkOrderDetail>(`/maintenance/work-orders/${id}`),
  setStatus: (id: string, status: WorkOrderStatus) =>
    api.post<WorkOrderListItem>(`/maintenance/work-orders/${id}/status`, { status }),
  assign: (id: string, technicianId: string) =>
    api.post<WorkOrderListItem>(`/maintenance/work-orders/${id}/assign`, { technicianId }),
  addNote: (id: string, note: string) => api.post<{ ok: true }>(`/maintenance/work-orders/${id}/notes`, { note }),
};

// ─── Housekeeping (HK-01, HK-02, HK-04) ────────────────────────────────────
export const housekeepingApi = {
  listRooms: () => api.get<HkRoom[]>("/housekeeping/rooms"),
  setStatus: (roomId: string, status: HkRoom["housekeepingStatus"]) =>
    api.post<HkRoom>(`/housekeeping/rooms/${roomId}/status`, { status }),
  assign: (roomId: string, attendantId: string | null) =>
    api.post<HkRoom>(`/housekeeping/rooms/${roomId}/assign`, { attendantId }),
  listInspections: () => api.get<Inspection[]>("/housekeeping/inspections"),
  createInspection: (roomId: string, result: "pass" | "fail", notes?: string) =>
    api.post<{ id: string }>("/housekeeping/inspections", { roomId, result, notes }),
};

// ─── Lost & Found (HK-05) ───────────────────────────────────────────────────
export const lostFoundApi = {
  list: () => api.get<LostFoundItem[]>("/lost-found"),
  create: (description: string, locationFound?: string) =>
    api.post<{ id: string }>("/lost-found", { description, locationFound }),
  claim: (id: string, claimedBy: string) => api.post<{ ok: true }>(`/lost-found/${id}/claim`, { claimedBy }),
  dispose: (id: string, reason: string) => api.post<{ ok: true }>(`/lost-found/${id}/dispose`, { reason }),
};

export interface CreateReservationInput {
  guestId?: string;
  newGuest?: { firstName: string; lastName: string; email?: string; phone?: string };
  roomId?: string;
  checkInDate: string;
  checkOutDate: string;
  rateKobo: number;
  adults?: number;
  children?: number;
  specialRequests?: string;
}

// ─── B10: front-desk lists ────────────────────────────────────────────────
// The server's `decorate()` adds guest and room detail to each reservation
// row so a list screen does not have to fan out one request per line.
export interface EnrichedReservation {
  id: string; guestId: string; roomId: string | null; roomTypeId: string | null;
  checkInDate: string; checkOutDate: string; status: string;
  rateKobo: number; adults: number; children: number; specialRequests: string | null;
  guestName: string | null; guestPhone: string | null; guestEmail: string | null;
  vip: boolean;
  roomNumber: string | null; roomTypeName: string | null; roomTypeCode: string | null;
}

/**
 * The two lists that show money — Departures and In-House — carry folio
 * totals per row. A clerk cannot check anyone out without knowing what they
 * owe, and the in-house list is where a bill running away gets noticed. The
 * server computes these after pagination, so the cost is bounded by page
 * size rather than by the whole list.
 */
export interface ReservationWithBalance extends EnrichedReservation {
  totalChargesKobo: number;
  totalPaidKobo: number;
  balanceKobo: number;
}

export type BalancePage = Page<ReservationWithBalance> & { businessDate: string };

export interface ReservationBrief {
  reservationId: string; guestName: string | null; vip: boolean; status: string;
  checkInDate: string; checkOutDate: string; rateKobo: number;
}

export interface AssignmentBoardRoom {
  roomId: string; number: string; floor: string | null; type: string;
  roomTypeId: string | null; roomTypeName: string | null;
  status: string; housekeepingStatus: string; dnd: boolean; priority: boolean;
  arrival: ReservationBrief | null;
  departure: ReservationBrief | null;
  occupant: ReservationBrief | null;
}

/**
 * The server does more than record the assignment: it reports whether the
 * room's type differs from what was booked and what that type indicates as a
 * rate. Verified against a live assignment — booked at ₦45,000, assigned to a
 * Deluxe, returned typeChanged: true and indicativeRateKobo: 5_500_000.
 *
 * `indicativeRateKobo` is INDICATIVE, not applied. Whether the guest actually
 * pays the difference after an upgrade is a commercial decision a person
 * makes, so the screen shows it and does not act on it.
 */
export interface AssignRoomResult extends EnrichedReservation {
  assignedRoomNumber: string | null;
  typeChanged: boolean;
  indicativeRateKobo: number | null;
}

export interface AssignmentBoard {
  businessDate: string;
  summary: {
    total: number; occupied: number; available: number; cleaning: number;
    outOfService: number; arrivals: number; departures: number; unassignedArrivals: number;
  };
  rooms: AssignmentBoardRoom[];
  unassignedArrivals: (ReservationBrief & { roomTypeId: string | null; roomTypeName: string | null })[];
}

export interface WalkInInput {
  guest: { firstName: string; lastName: string; email?: string; phone?: string };
  roomId: string;
  checkOutDate: string;
  rateKobo?: number;
  ratePlanId?: string;
  adults?: number;
  children?: number;
  depositKobo?: number;
  depositMethod?: "cash" | "card" | "transfer";
  specialRequests?: string;
}

export interface ReservationSearchParams {
  q?: string;
  /** Comma-separated server-side, e.g. "confirmed,pending". */
  status?: string;
  from?: string; to?: string;
  roomNumber?: string; roomTypeId?: string; ratePlanId?: string;
  cursor?: string; limit?: number;
  [key: string]: string | number | undefined;
}

export const reservationsApi = {
  list: () => api.get<ReservationListItem[]>("/reservations"),
  create: (input: CreateReservationInput) => api.post<ReservationListItem>("/reservations", input),
  get: (id: string) => api.get<ReservationDetail>(`/reservations/${id}`),
  checkIn: (id: string, roomId?: string) => api.post<ReservationListItem>(`/reservations/${id}/check-in`, roomId ? { roomId } : {}),
  postCharge: (id: string, charge: { category: string; description: string; quantity?: number; unitPriceKobo: number }) =>
    api.post<FolioSummary>(`/reservations/${id}/folio/charges`, charge),
  checkOut: (id: string, payment?: { paymentAmountKobo: number; paymentMethod: "cash" | "card" | "transfer" }) =>
    api.post<{ reservationId: string; status: string; folio: FolioSummary; accessRevoked: { revoked: number; queued: number; failed: number } }>(`/reservations/${id}/check-out`, payment ?? {}),

  // B10. `date` defaults server-side to the BUSINESS date, not the wall
  // clock — before the roll hour the trading day is still yesterday's, and
  // the night porter needs yesterday's arrivals, not an empty list.
  arrivals: (params: { date?: string; cursor?: string; limit?: number } = {}) =>
    api.get<ReservationPage>(`/reservations/arrivals${qs(params)}`),
  departures: (params: { date?: string; cursor?: string; limit?: number } = {}) =>
    api.get<BalancePage>(`/reservations/departures${qs(params)}`),
  inHouse: (params: { cursor?: string; limit?: number } = {}) =>
    api.get<BalancePage>(`/reservations/in-house${qs(params)}`),
  search: (params: ReservationSearchParams = {}) =>
    api.get<ReservationPage>(`/reservations/search${qs(params)}`),
  walkIn: (input: WalkInInput) => api.post<ReservationDetail>("/reservations/walk-in", input),

  // B9. Preview is a GET and changes nothing — it exists so the clerk can
  // tell the guest the penalty BEFORE committing to the cancellation.
  cancellationPreview: (id: string) =>
    api.get<CancellationPreview>(`/reservations/${id}/cancellation-preview`),
  cancel: (id: string, input: { reason: string; waivePenalty?: boolean }) =>
    api.post<{ reservationId: string; status: string; penaltyKobo: number; refundId: string | null }>(`/reservations/${id}/cancel`, input),
};

export interface CancellationPreview {
  reservationId: string;
  policyName: string | null;
  hoursUntilArrival: number;
  withinFreeWindow: boolean;
  penaltyKobo: number;
  refundableKobo: number;
  depositHeldKobo: number;
  explanation: string;
}

// ─── B9: refunds ──────────────────────────────────────────────────────────
export interface Refund {
  id: string; reservationId: string | null; folioId: string | null;
  amountKobo: number; reason: string; method: string;
  status: "pending" | "approved" | "rejected" | "paid";
  requestedBy: string; requestedByName: string | null; requestedAt: string;
  decidedBy: string | null; decidedByName: string | null; decidedAt: string | null;
  decisionNote: string | null;
}

export const refundsApi = {
  list: (params: { status?: string; cursor?: string; limit?: number } = {}) =>
    api.get<Page<Refund>>(`/refunds${qs(params)}`),
  get: (id: string) => api.get<Refund>(`/refunds/${id}`),
  create: (input: { reservationId?: string; folioId?: string; amountKobo: number; reason: string; method: string }) =>
    api.post<Refund>("/refunds", input),
  approve: (id: string, note?: string) => api.post<Refund>(`/refunds/${id}/approve`, { note }),
  reject: (id: string, note: string) => api.post<Refund>(`/refunds/${id}/reject`, { note }),
};

// ─── B7: invoices & receipts ──────────────────────────────────────────────
export interface Invoice {
  id: string; number: string; reservationId: string | null; folioId: string | null;
  guestName: string | null; issuedAt: string; dueAt: string | null;
  subtotalKobo: number; taxKobo: number; totalKobo: number; paidKobo: number; balanceKobo: number;
  status: "draft" | "issued" | "paid" | "void" | "credited";
  voidReason: string | null;
}
export interface Receipt {
  id: string; number: string; invoiceId: string | null; reservationId: string | null;
  guestName: string | null; amountKobo: number; method: string; issuedAt: string;
}

export const invoicesApi = {
  list: (params: { status?: string; cursor?: string; limit?: number } = {}) =>
    api.get<Page<Invoice>>(`/invoices${qs(params)}`),
  get: (id: string) => api.get<Invoice>(`/invoices/${id}`),
  create: (input: { reservationId?: string; folioId?: string; dueAt?: string }) =>
    api.post<Invoice>("/invoices", input),
  void: (id: string, reason: string) => api.post<Invoice>(`/invoices/${id}/void`, { reason }),
  creditNote: (id: string, input: { amountKobo: number; reason: string }) =>
    api.post<Invoice>(`/invoices/${id}/credit-note`, input),
  addPayment: (id: string, input: { amountKobo: number; method: string }) =>
    api.post<Receipt>(`/invoices/${id}/payments`, input),
};

export const receiptsApi = {
  list: (params: { cursor?: string; limit?: number } = {}) =>
    api.get<Page<Receipt>>(`/receipts${qs(params)}`),
  get: (id: string) => api.get<Receipt>(`/receipts/${id}`),
};

// ─── B8: rate plans & calendar ────────────────────────────────────────────
export interface RatePlan {
  id: string; code: string; name: string; roomTypeId: string | null;
  baseRateKobo: number; currency: string; isActive: boolean;
  minStayNights: number | null; maxStayNights: number | null;
  includesBreakfast: boolean; refundable: boolean; description: string | null;
}
export interface RateCalendarEntry {
  date: string; ratePlanId: string; roomTypeId: string | null;
  rateKobo: number; closed: boolean; minStayNights: number | null;
  isOverride: boolean;
}

export const ratePlansApi = {
  list: () => api.get<RatePlan[]>("/rate-plans"),
  create: (input: Partial<RatePlan> & { code: string; name: string; baseRateKobo: number }) =>
    api.post<RatePlan>("/rate-plans", input),
  update: (id: string, input: Partial<RatePlan>) => api.patch<RatePlan>(`/rate-plans/${id}`, input),
};

export const rateCalendarApi = {
  list: (params: { from: string; to: string; ratePlanId?: string }) =>
    api.get<RateCalendarEntry[]>(`/rate-calendar${qs(params)}`),
  bulk: (input: { ratePlanId: string; from: string; to: string; rateKobo?: number; closed?: boolean; minStayNights?: number; weekdays?: number[] }) =>
    api.post<{ updated: number }>("/rate-calendar/bulk", input),
};

// ─── Door Lock & Access Control (Phase 4, Blueprint Part 6) ────────────────
// FD-09 Key Card Management, FD-12 Room Access Management, FD-13 Key Card
// Log, FD-14 PIN Management, ST-04 Settings, Check-In Step 7. See
// server/src/services/locks/ for what's real here: the Lock Provider
// Interface and TTLock Adapter make genuine HTTP calls against TTLock's
// real documented API -- what can't be verified in this environment is
// whether a live TTLock account accepts them, since none exists here. The
// system runs correctly in "TTLock unreachable" mode (offline queue,
// physical key fallback) until real credentials are entered below.
export interface DoorLockConfig {
  provider: string; clientId: string | null; hasClientSecret: boolean;
  username: string | null; hasPassword: boolean;
  autoRevokeOnCheckout: boolean; queueWhenOffline: boolean; notifyMgtOnOfflineRevoke: boolean;
  maxCardsPerCheckIn: number; queueExpiryBufferHours: number;
}
export interface RoomLockMapping { roomId: string; roomNumber: string; ttlockLockId: string | null; lockName: string | null }
export interface AccessCredential {
  id: string; roomId: string; guestId: string; reservationId: string; credentialType: "card" | "pin" | "physical_key";
  credentialReference: string | null; validFrom: string; validTo: string;
  status: "active" | "revoked" | "expired" | "pending_sync" | "failed";
  isDuplicate: boolean; issuedBy: string; issuedAt: string;
  roomNumber: string; guestName: string; issuedByName: string;
}
export interface KeyCardEvent {
  id: string; eventType: string; performedAt: string; room: string; guest: string;
  credentialType: string; credentialReference: string | null; staff: string; details: string | null;
}
export interface LockQueueItem {
  id: string; commandType: string; room: string; createdAt: string; expiresAt: string;
  retryCount: number; lastRetryAt: string | null; errorLog: string | null;
}
export interface IssueCredentialResult { credentialId: string; status: string; queued: boolean; pin?: string }
export interface RevokeSummary { revoked: number; queued: number; failed: number }

export const doorLockApi = {
  getConfig: () => api.get<DoorLockConfig>("/door-lock/config"),
  saveConfig: (input: Partial<{ provider: string; clientId: string; clientSecret: string; username: string; password: string; autoRevokeOnCheckout: boolean; queueWhenOffline: boolean; notifyMgtOnOfflineRevoke: boolean; maxCardsPerCheckIn: number; queueExpiryBufferHours: number }>) =>
    api.post<DoorLockConfig>("/door-lock/config", input),
  testConnection: () => api.post<{ ok: boolean; lockCount?: number; error?: string }>("/door-lock/config/test-connection"),
  roomMapping: () => api.get<RoomLockMapping[]>("/door-lock/room-mapping"),
  saveRoomMapping: (roomId: string, ttlockLockId: string, lockName: string) =>
    api.post<{ ok: true }>("/door-lock/room-mapping", { roomId, ttlockLockId, lockName }),
  autoMap: () => api.post<{ matched: Array<{ roomNumber: string; lockName: string }>; unmatched: string[] }>("/door-lock/room-mapping/auto-map"),
  credentials: (status: string = "active") => api.get<AccessCredential[]>(`/door-lock/credentials?status=${status}`),
  events: () => api.get<KeyCardEvent[]>("/door-lock/events"),
  queue: () => api.get<LockQueueItem[]>("/door-lock/queue"),
  retryQueueNow: () => api.post<{ processed: number }>("/door-lock/queue/retry-now"),
  issue: (input: { reservationId: string; credentialType: "card" | "pin"; isDuplicate?: boolean; parentCredentialId?: string }) =>
    api.post<IssueCredentialResult>("/door-lock/issue", input),
  physicalKey: (input: { reservationId: string; keyReference: string; notes?: string }) =>
    api.post<IssueCredentialResult>("/door-lock/physical-key", input),
  revoke: (credentialId: string, reason: "checkout" | "lost" | "expired" | "manual" | "emergency") =>
    api.post<{ result: string }>(`/door-lock/revoke/${credentialId}`, { reason }),
  revokeRoom: (roomId: string, reason: string) =>
    api.post<RevokeSummary>(`/door-lock/revoke-room/${roomId}`, { reason }),
};
