// Shared types, design tokens, color maps, helpers, and all data.
// Imported by Screens.tsx and App.tsx. No circular dependencies.
import {
  BedDouble, Wrench, DollarSign, AlertTriangle, Star, Lock,
  MessageSquare, UtensilsCrossed,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
export type Role = "MGT" | "ORG" | "FD" | "HK" | "MX" | "FIN" | "RT" | "RSV" | "IT";
export type ToastType = "success" | "error" | "info" | "warning";
export interface Toast { id: string; type: ToastType; title: string; body?: string; }
export type AddToast = (t: Omit<Toast, "id">) => void;
// The `Screen` union, SCREEN_ROLE_MAP and DOOR_LOCK_SCREENS used to live
// here: a string id per screen, a role list per id, and a list of ids the
// Door Lock module gated. They were one of two sources of truth for
// navigation (react-router was the other), and keeping them in step was
// manual. All three are now fields on the route table in routes.tsx --
// `roles` and `module` respectively -- so a screen's URL, its label, who
// may see it and what disables it are declared together, once.

// ─── Design Tokens ───────────────────────────────────────────────────────────
export const mono = "'JetBrains Mono', monospace";
export const sans = "'Inter', system-ui, sans-serif";
export const NAV_BG = "#0F2044";
export const PRIMARY = "#123A73";
export const TEAL = "#1BA39C";
export const ORANGE = "#F57C00";
export const SUCCESS = "#2E7D32";
export const WARNING = "#FFA000";
export const ERROR = "#D32F2F";
export const BORDER = "#E2E8F0";
export const TEXT = "#0F172A";
export const MUTED = "#64748B";
export const SUBTLE = "#94A3B8";

// ─── Color Maps ──────────────────────────────────────────────────────────────
export const resStC: Record<string, { bg: string; text: string }> = {
  Confirmed: { bg: "#CCFBF1", text: "#0F766E" }, "Checked In": { bg: "#DCFCE7", text: "#166534" },
  "Checked Out": { bg: "#F3F4F6", text: "#374151" }, Cancelled: { bg: "#FEE2E2", text: "#991B1B" },
  "No Show": { bg: "#FEF2F2", text: "#991B1B" }, Pending: { bg: "#FEF3C7", text: "#92400E" },
};
export const hkC: Record<string, { bg: string; text: string }> = {
  Dirty: { bg: "#FEF3C7", text: "#92400E" }, "In Progress": { bg: "#DBEAFE", text: "#1E40AF" },
  Clean: { bg: "#D1FAE5", text: "#065F46" }, Inspected: { bg: "#DCFCE7", text: "#166534" },
  DND: { bg: "#F3F4F6", text: "#374151" }, Occupied: { bg: "#FEF3C7", text: "#B45309" }, Maintenance: { bg: "#FEE2E2", text: "#991B1B" },
};
export const woC: Record<string, { bg: string; text: string }> = {
  Reported: { bg: "#EEF2FF", text: "#4338CA" }, Assigned: { bg: "#CCFBF1", text: "#0F766E" },
  "In Progress": { bg: "#FEF3C7", text: "#92400E" }, Completed: { bg: "#DCFCE7", text: "#166534" }, Overdue: { bg: "#FEE2E2", text: "#991B1B" },
};
export const priC: Record<string, string> = { High: ERROR, Medium: ORANGE, Low: MUTED };
export const tblC: Record<string, { bg: string; border: string; text: string }> = {
  Available: { bg: "#DCFCE7", border: SUCCESS, text: "#166534" },
  Occupied: { bg: "#FEF3C7", border: ORANGE, text: "#92400E" },
  Reserved: { bg: "#CCFBF1", border: TEAL, text: "#0F766E" },
  Dirty: { bg: "#FEF9C3", border: WARNING, text: "#713F12" },
};
export const stC = (s: string) =>
  s === "Critical" ? { bg: "#FEE2E2", text: "#991B1B", bar: ERROR } :
  s === "Low" ? { bg: "#FEF3C7", text: "#92400E", bar: WARNING } :
  { bg: "#DCFCE7", text: "#166534", bar: SUCCESS };
export const roomStC: Record<string, { bg: string; text: string }> = {
  Available: { bg: "#DCFCE7", text: "#166534" }, Occupied: { bg: "#FEF3C7", text: "#92400E" },
  Cleaning: { bg: "#FEF9C3", text: "#713F12" }, Reserved: { bg: "#CCFBF1", text: "#0F766E" },
  Maintenance: { bg: "#FEE2E2", text: "#991B1B" }, "Out of Service": { bg: "#F3F4F6", text: "#374151" },
};
export const actC = (t: string) => ({ checkin: SUCCESS, checkout: "#6B7280", reservation: TEAL, maintenance: "#F97316", noshow: "#EF4444" }[t] ?? SUBTLE);
export const actBg = (t: string) => ({ checkin: "#F0FDF4", checkout: "#F8FAFC", reservation: "#ECFDF5", maintenance: "#FFF7ED", noshow: "#FEF2F2" }[t] ?? "#F8FAFC");

// ─── Helpers ─────────────────────────────────────────────────────────────────
export const uid = () => Math.random().toString(36).slice(2);
export const fmtN = (v: number) => v >= 1e6 ? `₦${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `₦${(v / 1e3).toFixed(0)}K` : `₦${v}`;

// ─── Data ─────────────────────────────────────────────────────────────────────
export const occData = [
  { day: "Mon", occ: 72, rev: 485 }, { day: "Tue", occ: 68, rev: 420 },
  { day: "Wed", occ: 81, rev: 560 }, { day: "Thu", occ: 88, rev: 610 },
  { day: "Fri", occ: 94, rev: 720 }, { day: "Sat", occ: 96, rev: 780 },
  { day: "Sun", occ: 79, rev: 530 },
];
export const revCat = [
  { name: "Rooms", value: 68, color: PRIMARY }, { name: "Restaurant", value: 18, color: TEAL },
  { name: "Events", value: 8, color: ORANGE }, { name: "Other", value: 6, color: SUBTLE },
];
export const roomSt = [
  { status: "Occupied", count: 62, color: ORANGE }, { status: "Available", count: 18, color: SUCCESS },
  { status: "Cleaning", count: 9, color: WARNING }, { status: "Reserved", count: 6, color: TEAL },
  { status: "Maintenance", count: 3, color: ERROR }, { status: "Out of Service", count: 2, color: "#6B7280" },
];
export const deptKPIs = [
  { dept: "Housekeeping", metric: "Rooms cleaned", value: "31/40", sub: "8 in progress", st: "warning", icon: BedDouble },
  { dept: "Maintenance", metric: "Open work orders", value: "7", sub: "2 overdue", st: "error", icon: Wrench },
  { dept: "Restaurant", metric: "Tables occupied", value: "12/24", sub: "4 orders in kitchen", st: "success", icon: UtensilsCrossed },
  { dept: "Finance", metric: "Outstanding balance", value: "₦284,500", sub: "3 folios pending", st: "warning", icon: DollarSign },
];
export const recentAct = [
  { id: "BK-2847", guest: "Adaeze Okonkwo", room: "304", action: "Checked In", time: "09:42", type: "checkin", av: "AO" },
  { id: "BK-2848", guest: "Emmanuel Adeyemi", room: "118", action: "Reserved", time: "09:31", type: "reservation", av: "EA" },
  { id: "BK-2845", guest: "Ngozi Eze", room: "212", action: "Checked Out", time: "09:15", type: "checkout", av: "NE" },
  { id: "WO-0091", guest: "Maintenance", room: "207", action: "Work Order Filed", time: "08:58", type: "maintenance", av: "MX" },
  { id: "BK-2844", guest: "Chukwuemeka Obi", room: "421", action: "Checked In", time: "08:44", type: "checkin", av: "CO" },
];
export const NOTIFS = [
  { id: 1, category: "Emergency", title: "Fire alarm — Zone B test scheduled", body: "Scheduled drill 10:30–10:45.", time: "2m", color: "#EF4444", icon: AlertTriangle, unread: true },
  { id: 2, category: "Reservation", title: "VIP arrival — Dr. Chukwuemeka Bello", body: "Suite 501 · Arriving 14:00 · Champagne requested", time: "8m", color: "#6366F1", icon: Star, unread: true },
  { id: 3, category: "Housekeeping", title: "Room 212 ready for inspection", body: "Attendant Grace Achebe completed cleaning", time: "15m", color: "#22C55E", icon: BedDouble, unread: true },
  { id: 4, category: "Maintenance", title: "Work order WO-0089 overdue", body: "AC unit — Room 316. Assigned: Emeka Nwosu", time: "32m", color: "#F97316", icon: Wrench, unread: false },
  { id: 5, category: "Finance", title: "End-of-day summary ready", body: "Total revenue: ₦1,247,800.", time: "1h", color: "#14B8A6", icon: DollarSign, unread: false },
  { id: 6, category: "Door Lock", title: "Card activation queued — Room 204", body: "Pending internet. Retry every 2 min.", time: "1h", color: "#8B5CF6", icon: Lock, unread: false },
  { id: 7, category: "Chat", title: "Message from Housekeeping", body: "@reception Room 407 minibar restocked.", time: "2h", color: "#3B82F6", icon: MessageSquare, unread: false },
];
export const ROOMS = [
  { id: "101", type: "Standard", floor: 1, status: "Occupied" }, { id: "102", type: "Standard", floor: 1, status: "Available" },
  { id: "103", type: "Deluxe", floor: 1, status: "Cleaning" }, { id: "104", type: "Standard", floor: 1, status: "Available" },
  { id: "201", type: "Deluxe", floor: 2, status: "Reserved" }, { id: "202", type: "Deluxe", floor: 2, status: "Occupied" },
  { id: "203", type: "Suite", floor: 2, status: "Occupied" }, { id: "204", type: "Standard", floor: 2, status: "Maintenance" },
  { id: "301", type: "Suite", floor: 3, status: "Available" }, { id: "302", type: "Deluxe", floor: 3, status: "Occupied" },
  { id: "304", type: "Standard", floor: 3, status: "Occupied" },
];
export const RES_GRID = [
  { room: "101", guest: "A. Okonkwo", start: 0, end: 3, color: SUCCESS }, { room: "101", guest: "B. Eze", start: 5, end: 8, color: TEAL },
  { room: "103", guest: "C. Bello", start: 1, end: 4, color: TEAL }, { room: "201", guest: "D. Hassan", start: 0, end: 5, color: TEAL },
  { room: "202", guest: "E. Adeyemi", start: 2, end: 6, color: SUCCESS }, { room: "304", guest: "H. Obi", start: 0, end: 4, color: SUCCESS },
];
export const IN_HOUSE = [
  { room: "101", guest: "Adaeze Okonkwo", checkin: "22 Jun", checkout: "25 Jun", nights: 1, vip: true, balance: 0 },
  { room: "202", guest: "Emmanuel Adeyemi", checkin: "23 Jun", checkout: "26 Jun", nights: 2, vip: false, balance: 45000 },
  { room: "203", guest: "Fatima Musa", checkin: "21 Jun", checkout: "24 Jun", nights: 0, vip: true, balance: 0 },
  { room: "304", guest: "Chukwuemeka Obi", checkin: "24 Jun", checkout: "28 Jun", nights: 4, vip: false, balance: 120000 },
  { room: "302", guest: "Ibrahim Lawal", checkin: "23 Jun", checkout: "25 Jun", nights: 1, vip: false, balance: 0 },
];
export const WORK_ORDERS = [
  { id: "WO-0091", location: "Room 207", cat: "Electrical", priority: "High", status: "In Progress", tech: "Emeka Nwosu", age: "1h 20m" },
  { id: "WO-0090", location: "Room 316", cat: "HVAC", priority: "High", status: "Overdue", tech: "Emeka Nwosu", age: "19h" },
  { id: "WO-0089", location: "Lobby", cat: "Plumbing", priority: "Medium", status: "Reported", tech: "Unassigned", age: "3h" },
  { id: "WO-0088", location: "Restaurant", cat: "Equipment", priority: "Low", status: "Assigned", tech: "Chidi Ike", age: "1d" },
  { id: "WO-0087", location: "Room 102", cat: "Furniture", priority: "Low", status: "Completed", tech: "Chidi Ike", age: "2d" },
];
export const HK_ROOMS = [
  { id: "101", type: "Standard", floor: 1, hkSt: "Dirty", attendant: "Grace Achebe", priority: false, dnd: false },
  { id: "102", type: "Standard", floor: 1, hkSt: "Clean", attendant: "Grace Achebe", priority: false, dnd: false },
  { id: "103", type: "Deluxe", floor: 1, hkSt: "In Progress", attendant: "Amaka Osei", priority: true, dnd: false },
  { id: "104", type: "Standard", floor: 1, hkSt: "Inspected", attendant: "Grace Achebe", priority: false, dnd: false },
  { id: "201", type: "Deluxe", floor: 2, hkSt: "Occupied", attendant: "Ngozi Ike", priority: false, dnd: false },
  { id: "202", type: "Deluxe", floor: 2, hkSt: "DND", attendant: "Ngozi Ike", priority: false, dnd: true },
  { id: "203", type: "Suite", floor: 2, hkSt: "Dirty", attendant: "Unassigned", priority: true, dnd: false },
  { id: "204", type: "Standard", floor: 2, hkSt: "Maintenance", attendant: "—", priority: false, dnd: false },
  { id: "301", type: "Suite", floor: 3, hkSt: "Clean", attendant: "Amaka Osei", priority: false, dnd: false },
  { id: "302", type: "Deluxe", floor: 3, hkSt: "In Progress", attendant: "Ngozi Ike", priority: false, dnd: false },
];
export const STAFF = [
  { id: "EMP-001", name: "Grace Mensah", role: "Hotel Manager", dept: "Management", phone: "+234 801 234 5678", status: "Active", lastLogin: "Today 07:04", av: "GM" },
  { id: "EMP-002", name: "John Abubakar", role: "Front Desk", dept: "Front Desk", phone: "+234 802 345 6789", status: "Active", lastLogin: "Today 07:15", av: "JA" },
  { id: "EMP-003", name: "Amaka Osei", role: "Housekeeping", dept: "Housekeeping", phone: "+234 803 456 7890", status: "Active", lastLogin: "Today 06:58", av: "AO" },
  { id: "EMP-004", name: "Emeka Nwosu", role: "Maintenance Tech", dept: "Maintenance", phone: "+234 804 567 8901", status: "Active", lastLogin: "Today 07:30", av: "EN" },
  { id: "EMP-005", name: "Fatima Al-Hassan", role: "Reservations", dept: "Reservations", phone: "+234 805 678 9012", status: "Active", lastLogin: "Today 08:00", av: "FA" },
  { id: "EMP-006", name: "Chidi Ike", role: "Maintenance Tech", dept: "Maintenance", phone: "+234 806 789 0123", status: "On Leave", lastLogin: "Yesterday 16:30", av: "CI" },
  { id: "EMP-007", name: "Ngozi Ike", role: "Housekeeping", dept: "Housekeeping", phone: "+234 807 890 1234", status: "Active", lastLogin: "Today 06:45", av: "NI" },
  { id: "EMP-008", name: "Bola Adewale", role: "Accountant", dept: "Finance", phone: "+234 808 901 2345", status: "Active", lastLogin: "Today 08:30", av: "BA" },
];
export const BRANCHES = [
  { id: "abj", name: "Abuja Branch", location: "Abuja, FCT", occ: 88, rev: "₦1.25M", issues: 9, lastSync: "2m ago", manager: "Grace Mensah", rooms: 100, status: "synced" },
  { id: "lag", name: "Lagos Branch", location: "Lagos, VI", occ: 72, rev: "₦980K", issues: 4, lastSync: "45m ago", manager: "Tunde Okafor", rooms: 75, status: "pending" },
  { id: "ph", name: "Port Harcourt", location: "Port Harcourt, Rivers", occ: 61, rev: "₦620K", issues: 2, lastSync: "3h ago", manager: "Amara Eze", rooms: 50, status: "synced" },
];
export const FOLIO_CHARGES = [
  { date: "24 Jun", cat: "Room", desc: "Deluxe Room 202 × 1 night", qty: 1, unit: 55000, amount: 55000, by: "System" },
  { date: "24 Jun", cat: "Restaurant", desc: "Room Service Order #RS-041", qty: 1, unit: 8500, amount: 8500, by: "John A." },
  { date: "24 Jun", cat: "Bar", desc: "Minibar — 2× Water, 1× Juice", qty: 3, unit: 1200, amount: 3600, by: "System" },
  { date: "25 Jun", cat: "Restaurant", desc: "Breakfast — 2 covers", qty: 2, unit: 4500, amount: 9000, by: "System" },
  { date: "25 Jun", cat: "Laundry", desc: "Express laundry — 3 items", qty: 3, unit: 2000, amount: 6000, by: "HK Staff" },
];
export const MENU_ITEMS = [
  { id: 1, name: "Jollof Rice + Chicken", price: 4500, cat: "Mains", avail: true },
  { id: 2, name: "Egusi Soup + Pounded Yam", price: 5200, cat: "Mains", avail: true },
  { id: 3, name: "Grilled Fish", price: 6800, cat: "Mains", avail: true },
  { id: 4, name: "Fried Plantain", price: 1500, cat: "Sides", avail: true },
  { id: 5, name: "Moi Moi", price: 1200, cat: "Sides", avail: false },
  { id: 6, name: "Chapman", price: 2000, cat: "Drinks", avail: true },
  { id: 7, name: "Zobo", price: 1000, cat: "Drinks", avail: true },
  { id: 8, name: "Bottled Water", price: 500, cat: "Drinks", avail: true },
  { id: 9, name: "Chocolate Cake", price: 3500, cat: "Desserts", avail: true },
  { id: 10, name: "Fruit Salad", price: 2500, cat: "Desserts", avail: true },
  { id: 11, name: "Suya", price: 3000, cat: "Starters", avail: true },
  { id: 12, name: "Spring Rolls (6pc)", price: 2800, cat: "Starters", avail: true },
];
export const MENU_CATS = ["Mains", "Starters", "Sides", "Drinks", "Desserts"];
export const TABLE_LAYOUT = [
  { id: "T01", seats: 2, status: "Available", col: 1, row: 1 },
  { id: "T02", seats: 4, status: "Occupied", col: 3, row: 1, guest: "Party of 3", time: "34m" },
  { id: "T03", seats: 4, status: "Occupied", col: 5, row: 1, guest: "Party of 4", time: "12m" },
  { id: "T04", seats: 6, status: "Reserved", col: 7, row: 1 },
  { id: "T05", seats: 2, status: "Available", col: 1, row: 3 },
  { id: "T06", seats: 4, status: "Occupied", col: 3, row: 3, guest: "Party of 2", time: "1h 5m" },
  { id: "T07", seats: 4, status: "Dirty", col: 5, row: 3 },
  { id: "T08", seats: 8, status: "Available", col: 7, row: 3 },
  { id: "T09", seats: 2, status: "Occupied", col: 1, row: 5, guest: "Party of 2", time: "22m" },
  { id: "T10", seats: 6, status: "Reserved", col: 3, row: 5 },
  { id: "T11", seats: 4, status: "Available", col: 5, row: 5 },
  { id: "T12", seats: 4, status: "Occupied", col: 7, row: 5, guest: "Party of 3", time: "8m" },
];
export const STOCK = [
  { name: "Bath Towels", cat: "Linen", current: 45, par: 80, reorder: 30, unit: "pcs", cost: 1500, status: "Low" },
  { name: "Bed Sheets (Queen)", cat: "Linen", current: 62, par: 100, reorder: 40, unit: "sets", cost: 3500, status: "Ok" },
  { name: "Shampoo (50ml)", cat: "Toiletries", current: 28, par: 200, reorder: 50, unit: "pcs", cost: 250, status: "Critical" },
  { name: "Toilet Paper", cat: "Toiletries", current: 180, par: 300, reorder: 100, unit: "rolls", cost: 150, status: "Ok" },
  { name: "Bottled Water (50cl)", cat: "F&B", current: 240, par: 500, reorder: 150, unit: "bottles", cost: 100, status: "Low" },
  { name: "Cooking Gas (12kg)", cat: "Kitchen", current: 3, par: 10, reorder: 4, unit: "cylinders", cost: 12000, status: "Critical" },
];
export const CHAT_MSGS: Record<string, Array<{ from: string; av: string; msg: string; time: string; mine: boolean }>> = {
  "All Staff": [
    { from: "Grace Mensah", av: "GM", msg: "🚨 Fire drill scheduled 10:30–10:45. All staff to posts.", time: "09:00", mine: true },
    { from: "John Abubakar", av: "JA", msg: "Front desk acknowledged.", time: "09:01", mine: false },
    { from: "Amaka Osei", av: "AO", msg: "Housekeeping acknowledged.", time: "09:02", mine: false },
  ],
  "Reception": [
    { from: "John Abubakar", av: "JA", msg: "Room 304 guest requesting late checkout — 14:00. Approved?", time: "09:15", mine: false },
    { from: "Grace Mensah", av: "GM", msg: "Approved. Note on folio and inform housekeeping.", time: "09:17", mine: true },
    { from: "John Abubakar", av: "JA", msg: "Done. VIP suite 501 prepped and ready.", time: "09:20", mine: false },
    { from: "Grace Mensah", av: "GM", msg: "Great. Champagne chilled before 13:30 please.", time: "09:22", mine: true },
  ],
  "Housekeeping": [
    { from: "Amaka Osei", av: "AO", msg: "Room 103 done. Ready for inspection.", time: "08:45", mine: false },
    { from: "Grace Mensah", av: "GM", msg: "Sending supervisor now.", time: "08:46", mine: true },
    { from: "Ngozi Ike", av: "NI", msg: "Room 202 guest has DND — skipping for now.", time: "09:00", mine: false },
  ],
  "Maintenance": [
    { from: "Emeka Nwosu", av: "EN", msg: "AC in Room 316 not cooling. Checking now.", time: "08:30", mine: false },
    { from: "Grace Mensah", av: "GM", msg: "How long? Guest checks out at 12.", time: "08:32", mine: true },
    { from: "Emeka Nwosu", av: "EN", msg: "Compressor issue. 2–3 hours minimum.", time: "08:35", mine: false },
    { from: "Grace Mensah", av: "GM", msg: "Offer guest a room move. Front desk will handle.", time: "08:37", mine: true },
  ],
};
export const ALL_RES = [
  { id: "BK-2849", guest: "Dr. Chukwuemeka Bello", room: "501", type: "Suite", checkin: "24 Jun", checkout: "27 Jun", status: "Confirmed", source: "Walk-in", nights: 3, rate: 85000 },
  { id: "BK-2850", guest: "Aisha Mohammed", room: "203", type: "Deluxe", checkin: "24 Jun", checkout: "26 Jun", status: "Checked In", source: "Online", nights: 2, rate: 55000 },
  { id: "BK-2848", guest: "Emmanuel Adeyemi", room: "202", type: "Deluxe", checkin: "23 Jun", checkout: "26 Jun", status: "Checked In", source: "Phone", nights: 3, rate: 55000 },
  { id: "BK-2847", guest: "Adaeze Okonkwo", room: "101", type: "Standard", checkin: "22 Jun", checkout: "25 Jun", status: "Checked In", source: "Online", nights: 3, rate: 35000 },
  { id: "BK-2845", guest: "Ngozi Eze", room: "212", type: "Standard", checkin: "20 Jun", checkout: "22 Jun", status: "Checked Out", source: "Walk-in", nights: 2, rate: 35000 },
  { id: "BK-2843", guest: "Fatima Al-Hassan", room: "309", type: "Deluxe", checkin: "23 Jun", checkout: "24 Jun", status: "No Show", source: "Online", nights: 1, rate: 55000 },
  { id: "BK-2840", guest: "Tunde Bakare", room: "118", type: "Standard", checkin: "28 Jun", checkout: "30 Jun", status: "Confirmed", source: "Phone", nights: 2, rate: 35000 },
];
export const ARRIVALS_DATA = [
  { id: "BK-2849", guest: "Dr. Chukwuemeka Bello", type: "Suite 501", eta: "14:00", nights: 3, vip: true, requests: "Champagne, high floor", assigned: true, av: "CB" },
  { id: "BK-2850", guest: "Aisha Mohammed", type: "Deluxe 203", eta: "12:00", nights: 2, vip: false, requests: "—", assigned: true, av: "AM" },
  { id: "BK-2851", guest: "Peter Okafor", type: "Standard 102", eta: "15:30", nights: 1, vip: false, requests: "Late check-out if possible", assigned: false, av: "PO" },
  { id: "BK-2852", guest: "Ngozi Adeyemi", type: "Deluxe 304", eta: "16:00", nights: 4, vip: false, requests: "Extra towels", assigned: false, av: "NA" },
  { id: "BK-2853", guest: "Chief Emeka Okafor", type: "Suite 502", eta: "18:30", nights: 5, vip: true, requests: "Airport transfer, dinner reservation", assigned: true, av: "EO" },
];
export const ACCESS_CREDS = [
  { room: "101", guest: "Adaeze Okonkwo", cards: [{ serial: "XXXX-1A2B", issued: "22 Jun 14:03", by: "John A." }], pin: { hint: "74**12", issued: "22 Jun 14:05", by: "John A." }, validTo: "25 Jun 11:00", status: "Active" },
  { room: "202", guest: "Emmanuel Adeyemi", cards: [{ serial: "XXXX-3C4D", issued: "23 Jun 14:10", by: "John A." }, { serial: "XXXX-5E6F", issued: "23 Jun 14:12", by: "John A." }], pin: null, validTo: "26 Jun 11:00", status: "Active" },
  { room: "304", guest: "Chukwuemeka Obi", cards: [{ serial: "XXXX-7G8H", issued: "24 Jun 10:00", by: "John A." }], pin: { hint: "55**88", issued: "24 Jun 10:01", by: "John A." }, validTo: "28 Jun 11:00", status: "Active" },
];
export const KEY_LOG = [
  { ts: "24 Jun 10:01:32", event: "Issued", room: "304", guest: "Chukwuemeka Obi", type: "Key Card", ref: "XXXX-7G8H", staff: "John Abubakar", apiResp: "success" },
  { ts: "24 Jun 10:01:55", event: "PIN Issued", room: "304", guest: "Chukwuemeka Obi", type: "PIN", ref: "55**88", staff: "John Abubakar", apiResp: "success" },
  { ts: "23 Jun 14:12:08", event: "Duplicate Issued", room: "202", guest: "Emmanuel Adeyemi", type: "Key Card", ref: "XXXX-5E6F", staff: "John Abubakar", apiResp: "success" },
  { ts: "22 Jun 08:30:00", event: "Revoked — Checkout", room: "106", guest: "Bisi Ogundimu", type: "Key Card", ref: "XXXX-9I0J", staff: "System", apiResp: "success" },
  { ts: "22 Jun 07:15:22", event: "Encode Failed", room: "211", guest: "Ahmed Sule", type: "Key Card", ref: "—", staff: "John Abubakar", apiResp: "error: encoder timeout" },
  { ts: "21 Jun 14:05:10", event: "Queued Offline", room: "312", guest: "Mary Okeke", type: "PIN", ref: "pending", staff: "Grace Mensah", apiResp: "queued: no internet" },
];
export const ACTIVE_PINS = [
  { room: "101", guest: "Adaeze Okonkwo", hint: "74**12", validFrom: "22 Jun 14:05", validTo: "25 Jun 11:00", status: "Active", by: "John A." },
  { room: "203", guest: "Fatima Musa", hint: "91**47", validFrom: "21 Jun 13:00", validTo: "24 Jun 12:00", status: "Expiring", by: "Grace M." },
  { room: "304", guest: "Chukwuemeka Obi", hint: "55**88", validFrom: "24 Jun 10:01", validTo: "28 Jun 11:00", status: "Active", by: "John A." },
];
export const LOST_FOUND = [
  { id: "LF-041", desc: "Black iPhone 14 Pro", location: "Room 304", date: "24 Jun", loggedBy: "Amaka Osei", claimedBy: "—", status: "Held" },
  { id: "LF-040", desc: "Gold wristwatch (Casio)", location: "Restaurant", date: "23 Jun", loggedBy: "Ngozi Ike", claimedBy: "—", status: "Held" },
  { id: "LF-039", desc: "Blue laptop bag", location: "Lobby", date: "22 Jun", loggedBy: "John Abubakar", claimedBy: "Tunde Lawal", status: "Claimed" },
  { id: "LF-038", desc: "Reading glasses", location: "Room 212", date: "21 Jun", loggedBy: "Grace Achebe", claimedBy: "—", status: "Disposed" },
];
export const DND_ROOMS = [
  { room: "202", guest: "Emmanuel Adeyemi", checkout: "26 Jun 11:00", dndStart: "08:15", hours: 2.2, wellness: "—", flag: false },
  { room: "315", guest: "Chiamaka Eze", checkout: "25 Jun 11:00", dndStart: "06:00", hours: 14.5, wellness: "10:00 — no response", flag: true },
  { room: "410", guest: "Musa Ibrahim", checkout: "25 Jun 11:00", dndStart: "07:30", hours: 13.1, wellness: "—", flag: true },
];
export const INVOICES_DATA = [
  { id: "INV-2847", guest: "Adaeze Okonkwo", room: "101", date: "24 Jun", amount: 165000, status: "Paid", av: "AO" },
  { id: "INV-2848", guest: "Emmanuel Adeyemi", room: "202", date: "23 Jun", amount: 82100, status: "Outstanding", av: "EA" },
  { id: "INV-2845", guest: "Ngozi Eze", room: "212", date: "22 Jun", amount: 45000, status: "Paid", av: "NE" },
  { id: "INV-2844", guest: "Chukwuemeka Obi", room: "304", date: "24 Jun", amount: 340000, status: "Outstanding", av: "CO" },
];
export const AP_DATA = [
  { vendor: "Eko Gas Supplies", invoice: "EGS-2041", date: "20 Jun", due: "27 Jun", amount: 85000, status: "Unpaid" },
  { vendor: "FoodstuffPro Ltd", invoice: "FP-1182", date: "18 Jun", due: "25 Jun", amount: 142000, status: "Overdue" },
  { vendor: "TechFix Services", invoice: "TF-0091", date: "22 Jun", due: "29 Jun", amount: 35000, status: "Unpaid" },
  { vendor: "CleanPro Laundry", invoice: "CP-3308", date: "15 Jun", due: "22 Jun", amount: 28000, status: "Paid" },
];
export const DEPT_PERMS: Record<string, string[]> = {
  "Front Desk": ["Dashboard", "Reservations (View)", "Reservations (Create)", "Check-In", "Check-Out", "Folio (View)", "Folio (Post Charge)", "Guest Profiles", "Key Card Management", "Room Access Management", "Communications"],
  "Housekeeping": ["Dashboard", "Housekeeping Board", "My Tasks", "Lost & Found", "DND Log", "Inspection Log", "Communications"],
  "Maintenance": ["Dashboard", "Work Orders (View)", "Work Orders (Create)", "Work Orders (Update)", "Asset Register", "Preventive Schedule", "Communications"],
  "Finance": ["Dashboard", "Folio (Full)", "Invoices", "Daily Summary", "Accounts Payable", "Revenue Reports", "Stock Dashboard", "Communications"],
  "Management": ["All Modules", "Reports", "HR & Staff", "Settings", "Multi-Branch", "Discount Approval", "Emergency Revoke", "Audit Log"],
};
export const ATTEND_DATA = [
  { name: "John Abubakar", dept: "Front Desk", days: ["P", "P", "P", "P", "P"] },
  { name: "Amaka Osei", dept: "Housekeeping", days: ["P", "P", "P", "A", "P"] },
  { name: "Emeka Nwosu", dept: "Maintenance", days: ["P", "P", "L", "L", "P"] },
  { name: "Fatima Al-Hassan", dept: "Reservations", days: ["P", "P", "P", "P", "P"] },
  { name: "Chidi Ike", dept: "Maintenance", days: ["L", "L", "L", "L", "L"] },
  { name: "Ngozi Ike", dept: "Housekeeping", days: ["P", "P", "P", "P", "A"] },
  { name: "Bola Adewale", dept: "Finance", days: ["P", "P", "P", "P", "P"] },
];
export const SYNC_BRANCHES = [
  { name: "Abuja Branch", ip: "192.168.1.1", lastSync: "2m ago", pending: 0, status: "synced" },
  { name: "Lagos Branch", ip: "10.0.0.1", lastSync: "47m ago", pending: 5, status: "pending" },
  { name: "Port Harcourt", ip: "172.16.0.1", lastSync: "3h 12m ago", pending: 0, status: "synced" },
];
export const KDS_ORDERS = [
  { id: "ORD-041", table: "T02", items: [{ name: "Jollof Rice + Chicken", mod: "Extra spicy" }, { name: "Chapman", mod: "" }], elapsed: 4 },
  { id: "ORD-040", table: "T06", items: [{ name: "Egusi Soup + Pounded Yam", mod: "" }, { name: "Grilled Fish", mod: "No pepper" }], elapsed: 12 },
  { id: "ORD-039", table: "Room 304", items: [{ name: "Suya", mod: "Extra suya spice" }, { name: "Bottled Water ×2", mod: "" }], elapsed: 21 },
  { id: "ORD-038", table: "T09", items: [{ name: "Spring Rolls (6pc)", mod: "" }, { name: "Chapman", mod: "" }], elapsed: 6 },
];
export const REV_DATA = [
  { month: "Jan", rooms: 620, fb: 180, events: 90, other: 40 }, { month: "Feb", rooms: 710, fb: 210, events: 60, other: 50 },
  { month: "Mar", rooms: 780, fb: 230, events: 120, other: 45 }, { month: "Apr", rooms: 690, fb: 195, events: 80, other: 38 },
  { month: "May", rooms: 850, fb: 260, events: 110, other: 55 }, { month: "Jun", rooms: 1250, fb: 225, events: 155, other: 65 },
];
export const USERS_DATA = [
  { name: "Grace Mensah", email: "g.mensah@grandpalms.ng", role: "MGT", dept: "Management", status: "Active", lastLogin: "Today 07:04" },
  { name: "John Abubakar", email: "j.abubakar@grandpalms.ng", role: "FD", dept: "Front Desk", status: "Active", lastLogin: "Today 07:15" },
  { name: "Amaka Osei", email: "a.osei@grandpalms.ng", role: "HK", dept: "Housekeeping", status: "Active", lastLogin: "Today 06:58" },
  { name: "Emeka Nwosu", email: "e.nwosu@grandpalms.ng", role: "MX", dept: "Maintenance", status: "Active", lastLogin: "Today 07:30" },
  { name: "Fatima Al-Hassan", email: "f.hassan@grandpalms.ng", role: "RSV", dept: "Reservations", status: "Active", lastLogin: "Today 08:00" },
  { name: "Bola Adewale", email: "b.adewale@grandpalms.ng", role: "FIN", dept: "Finance", status: "Active", lastLogin: "Today 08:30" },
];
export const ASSETS = [
  { id: "AST-001", name: "Central Air Conditioning Unit", cat: "HVAC", location: "Roof", purchased: "Jan 2021", warranty: "Jan 2024", lastService: "12 Mar 2025", nextService: "12 Jun 2025", status: "Overdue" },
  { id: "AST-002", name: "Commercial Refrigerator (Restaurant)", cat: "Kitchen", location: "Restaurant Kitchen", purchased: "Mar 2022", warranty: "Mar 2025", lastService: "10 May 2025", nextService: "10 Aug 2025", status: "Ok" },
  { id: "AST-003", name: "Elevator #1", cat: "Infrastructure", location: "Main Lobby", purchased: "Sep 2019", warranty: "Sep 2024", lastService: "01 Jun 2025", nextService: "01 Sep 2025", status: "Ok" },
  { id: "AST-004", name: "Diesel Generator (50kVA)", cat: "Power", location: "Generator Room", purchased: "Jun 2020", warranty: "Jun 2025", lastService: "15 May 2025", nextService: "15 Jun 2025", status: "Due Soon" },
];
export const SUPPLIERS_DATA = [
  { id: "SUP-001", company: "FoodstuffPro Ltd", contact: "Mr. Dayo Ola", phone: "+234 801 100 2000", cat: "Food & Beverage", terms: "Net 30", lastOrder: "20 Jun 2025" },
  { id: "SUP-002", company: "Eko Gas Supplies", contact: "Mrs. Bisi James", phone: "+234 802 200 3000", cat: "Kitchen / Gas", terms: "Net 7", lastOrder: "18 Jun 2025" },
  { id: "SUP-003", company: "CleanPro Laundry", contact: "Mr. Emeka Ike", phone: "+234 803 300 4000", cat: "Linen / Cleaning", terms: "Net 14", lastOrder: "15 Jun 2025" },
  { id: "SUP-004", company: "TechFix Services", contact: "Engr. Seun Adeyemi", phone: "+234 804 400 5000", cat: "Maintenance", terms: "COD", lastOrder: "22 Jun 2025" },
];
export const PRODUCTS_DATA = [
  { code: "PR-001", name: "Shampoo (50ml)", cat: "Toiletries", unit: "pcs", stock: 28, par: 200, reorder: 50, cost: 250 },
  { code: "PR-002", name: "Bath Towels", cat: "Linen", unit: "pcs", stock: 45, par: 80, reorder: 30, cost: 1500 },
  { code: "PR-003", name: "Bottled Water (50cl)", cat: "F&B", unit: "bottles", stock: 240, par: 500, reorder: 150, cost: 100 },
  { code: "PR-004", name: "Cooking Gas (12kg)", cat: "Kitchen", unit: "cylinders", stock: 3, par: 10, reorder: 4, cost: 12000 },
  { code: "PR-005", name: "Toilet Paper", cat: "Toiletries", unit: "rolls", stock: 180, par: 300, reorder: 100, cost: 150 },
  { code: "PR-006", name: "Bed Sheets (Queen)", cat: "Linen", unit: "sets", stock: 62, par: 100, reorder: 40, cost: 3500 },
];
export const STOCK_TXN = [
  { date: "24 Jun 09:30", item: "Bath Towels", type: "Out", qty: 8, ref: "HK-Daily", by: "Amaka Osei" },
  { date: "24 Jun 09:00", item: "Shampoo (50ml)", type: "Out", qty: 12, ref: "HK-Daily", by: "Amaka Osei" },
  { date: "23 Jun 14:00", item: "Cooking Gas (12kg)", type: "In", qty: 3, ref: "PO-0042", by: "Grace Mensah" },
  { date: "23 Jun 10:15", item: "Bottled Water (50cl)", type: "Out", qty: 48, ref: "Restaurant", by: "Ngozi Ike" },
  { date: "22 Jun 09:00", item: "Toilet Paper", type: "Adjustment", qty: -5, ref: "Count variance", by: "Bola Adewale" },
];
export const PO_DATA = [
  { id: "PO-0043", supplier: "FoodstuffPro Ltd", date: "24 Jun", items: 8, total: 142000, status: "Draft" },
  { id: "PO-0042", supplier: "Eko Gas Supplies", date: "23 Jun", items: 2, total: 85000, status: "Received" },
  { id: "PO-0041", supplier: "CleanPro Laundry", date: "22 Jun", items: 3, total: 52000, status: "Received" },
  { id: "PO-0040", supplier: "TechFix Services", date: "20 Jun", items: 4, total: 35000, status: "Sent" },
];
export const DEVICES = [
  { name: "Reception PC #1", type: "PC", dept: "Front Desk", ip: "192.168.1.22", mac: "AA:BB:CC:DD:EE:01", lastSeen: "Just now", status: "Online" },
  { name: "Reception PC #2", type: "PC", dept: "Front Desk", ip: "192.168.1.23", mac: "AA:BB:CC:DD:EE:02", lastSeen: "2m ago", status: "Online" },
  { name: "HK Tablet #1", type: "Tablet", dept: "Housekeeping", ip: "192.168.1.31", mac: "AA:BB:CC:DD:EE:03", lastSeen: "8m ago", status: "Online" },
  { name: "HK Tablet #2", type: "Tablet", dept: "Housekeeping", ip: "192.168.1.32", mac: "AA:BB:CC:DD:EE:04", lastSeen: "1h ago", status: "Idle" },
  { name: "Restaurant POS", type: "PC", dept: "Restaurant", ip: "192.168.1.41", mac: "AA:BB:CC:DD:EE:05", lastSeen: "5m ago", status: "Online" },
];
export const HK_TASK_ROOMS = [
  { id: "101", type: "Standard", floor: 1, guestStatus: "Checked Out", hkStatus: "Dirty", notes: "Extra pillows requested for next guest", priority: true },
  { id: "102", type: "Standard", floor: 1, guestStatus: "Vacant", hkStatus: "Dirty", notes: "", priority: false },
  { id: "203", type: "Suite", floor: 2, guestStatus: "Checked Out", hkStatus: "Dirty", notes: "VIP arrival today — champagne pre-positioned", priority: true },
];
export const INV_CONS = [
  { month: "Jan", val: 45 }, { month: "Feb", val: 52 }, { month: "Mar", val: 61 },
  { month: "Apr", val: 48 }, { month: "May", val: 67 }, { month: "Jun", val: 71 },
];
export const STAFF_RPT = [
  { dept: "Front Desk", hours: 312, attend: 96, staff: 2 }, { dept: "Housekeeping", hours: 468, attend: 92, staff: 3 },
  { dept: "Maintenance", hours: 270, attend: 88, staff: 2 }, { dept: "Finance", hours: 156, attend: 100, staff: 1 },
  { dept: "Restaurant", hours: 390, attend: 94, staff: 3 },
];
export const RATE_PLANS = [
  { id: "RP-001", name: "Standard Rate", rooms: ["Standard", "Deluxe", "Suite"], base: 35000, active: true, dates: "Year-round" },
  { id: "RP-002", name: "Corporate Rate", rooms: ["Standard", "Deluxe"], base: 28000, active: true, dates: "Year-round" },
  { id: "RP-003", name: "Weekend Special", rooms: ["Standard", "Deluxe", "Suite"], base: 42000, active: true, dates: "Fri–Sun" },
  { id: "RP-004", name: "Group Rate (10+)", rooms: ["Standard", "Deluxe"], base: 25000, active: true, dates: "Year-round" },
  { id: "RP-005", name: "Christmas Promo", rooms: ["Suite"], base: 110000, active: false, dates: "Dec 20 – Jan 5" },
];
export const WAITLIST_DATA = [
  { id: "WL-018", guest: "Amara Nwosu", type: "Suite", dates: "26–29 Jun", waiting: "2 days", priority: 1 },
  { id: "WL-017", guest: "Kunle Badmus", type: "Deluxe", dates: "25–27 Jun", waiting: "3 days", priority: 2 },
  { id: "WL-016", guest: "Sade Oladipo", type: "Standard", dates: "25 Jun", waiting: "1 day", priority: 3 },
];
export const ROOM_SERVICE_ORDERS = [
  { id: "RS-043", room: "501", guest: "Dr. C. Bello", items: "Grilled Fish + Chapman ×2", ordered: "18:45", promised: "19:15", status: "In Kitchen", assigned: "Emeka D." },
  { id: "RS-042", room: "304", guest: "Chukwuemeka Obi", items: "Jollof Rice + Chicken + Water ×2", ordered: "18:30", promised: "19:00", status: "Delivered", assigned: "Grace A." },
  { id: "RS-041", room: "202", guest: "Emmanuel Adeyemi", items: "Suya + Chapman", ordered: "18:10", promised: "18:40", status: "Delivered", assigned: "Grace A." },
];
export const DINING_RES = [
  { date: "24 Jun", time: "19:00", party: 4, guest: "Dr. Chukwuemeka Bello", table: "T04", requests: "Window seat, no shellfish", status: "Confirmed" },
  { date: "24 Jun", time: "20:00", party: 2, guest: "External Walk-in", table: "T01", requests: "Anniversary dinner", status: "Confirmed" },
  { date: "25 Jun", time: "12:30", party: 6, guest: "Adaeze Okonkwo", table: "T08", requests: "Vegetarian options needed", status: "Confirmed" },
];
export const ANNOUNCE_DATA = [
  { id: "ANN-012", title: "Fire Drill — 24 Jun 10:30", body: "All staff to designated fire assembly points. Drill lasts approximately 15 minutes.", audience: "All Staff", expires: "24 Jun 2025", by: "Grace Mensah", read: 7, total: 8 },
  { id: "ANN-011", title: "New Housekeeping SOP — Minibar Restock", body: "Minibar restocking must be completed and logged before marking a room as Inspected.", audience: "Housekeeping", expires: "30 Jun 2025", by: "Grace Mensah", read: 3, total: 3 },
  { id: "ANN-010", title: "Staff Appreciation Event — 28 Jun", body: "Monthly staff gathering at 16:00 in the staff lounge. All shifts welcome.", audience: "All Staff", expires: "28 Jun 2025", by: "Grace Mensah", read: 5, total: 8 },
];
export const PAYROLL_DATA = [
  { name: "Grace Mensah", role: "Hotel Manager", dept: "Management", baseSalary: 350000, overtime: 0, deductions: 35000, net: 315000 },
  { name: "John Abubakar", role: "Front Desk", dept: "Front Desk", baseSalary: 120000, overtime: 18000, deductions: 12000, net: 126000 },
  { name: "Amaka Osei", role: "Housekeeping", dept: "Housekeeping", baseSalary: 90000, overtime: 9000, deductions: 9000, net: 90000 },
  { name: "Emeka Nwosu", role: "Maintenance Tech", dept: "Maintenance", baseSalary: 110000, overtime: 22000, deductions: 11000, net: 121000 },
  { name: "Fatima Al-Hassan", role: "Reservations", dept: "Reservations", baseSalary: 115000, overtime: 0, deductions: 11500, net: 103500 },
  { name: "Bola Adewale", role: "Accountant", dept: "Finance", baseSalary: 180000, overtime: 0, deductions: 18000, net: 162000 },
];
export const GUEST_ANALYTICS_DATA = [
  { month: "Jan", repeat: 28, new: 72 }, { month: "Feb", repeat: 31, new: 69 },
  { month: "Mar", repeat: 35, new: 65 }, { month: "Apr", repeat: 29, new: 71 },
  { month: "May", repeat: 38, new: 62 }, { month: "Jun", repeat: 42, new: 58 },
];
export const NATIONALITY_DATA = [
  { name: "Nigerian", value: 58, color: PRIMARY }, { name: "UK / USA", value: 18, color: TEAL },
  { name: "Ghana", value: 9, color: ORANGE }, { name: "South Africa", value: 7, color: "#6366F1" },
  { name: "Other", value: 8, color: SUBTLE },
];
