// Seeds one organization/branch and the same demo accounts the frontend's
// Auth.tsx DEMO_ACCOUNTS map already advertises, so the existing demo
// credential picker keeps working once it's wired to this server instead of
// the hardcoded map. Password for every seeded account: "demo123".
//
// Run with: npm run seed  (from server/)
import { nanoid } from "nanoid";
import { db, sqlite } from "./db/client.js";
import { organizations, branches, users, rooms, guests, reservations, folioCharges, payments, menuCategories, menuItems, restaurantTables, chatChannels, products, suppliers, attendance, shifts, leaveRequests, staffNotes } from "./db/schema.js";
import { hashPassword } from "./auth/passwords.js";
import { toKobo, mulKobo } from "./lib/money.js";
import { claimRoomNights } from "./services/roomInventory.js";
import { businessDateOf } from "./lib/businessDate.js";

const DEMO_PASSWORD = "demo123";

async function seed() {
  const existingOrg = db.select().from(organizations).limit(1).get();
  if (existingOrg) {
    console.log("[seed] Data already present, skipping. Delete server/data/nexura.db to reseed from scratch.");
    return;
  }

  const now = new Date();
  const orgId = nanoid();
  const branchId = nanoid();

  db.insert(organizations).values({ id: orgId, name: "Grand Palms", createdAt: now }).run();
  db.insert(branches).values({ id: branchId, organizationId: orgId, name: "Abuja Branch", createdAt: now, currentBusinessDate: businessDateOf(now) }).run();

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // Money literals below are in NAIRA for readability and are converted to
  // kobo via toKobo() at insert -- the sanctioned boundary conversion (B2).
  const demoUsers: Array<{ email: string; role: string; firstName: string; lastName: string; department: string; phone: string; payRate: number; startDate: Date }> = [
    { email: "owner@grandpalms.ng", role: "ORG", firstName: "Amaka", lastName: "Owner", department: "Management", phone: "+234 801 000 0001", payRate: 800000, startDate: new Date("2021-03-01") },
    { email: "manager@grandpalms.ng", role: "MGT", firstName: "Tunde", lastName: "Manager", department: "Management", phone: "+234 801 000 0002", payRate: 450000, startDate: new Date("2021-06-15") },
    { email: "frontdesk@grandpalms.ng", role: "FD", firstName: "Sarah", lastName: "Okafor", department: "Front Desk", phone: "+234 802 555 0101", payRate: 180000, startDate: new Date("2022-01-10") },
    { email: "housekeeper@grandpalms.ng", role: "HK", firstName: "Ngozi", lastName: "Bello", department: "Housekeeping", phone: "+234 802 555 0102", payRate: 120000, startDate: new Date("2022-04-20") },
    { email: "maintenance@grandpalms.ng", role: "MX", firstName: "Emeka", lastName: "Yusuf", department: "Maintenance", phone: "+234 802 555 0103", payRate: 150000, startDate: new Date("2022-02-05") },
    { email: "finance@grandpalms.ng", role: "FIN", firstName: "Fatima", lastName: "Adamu", department: "Finance", phone: "+234 802 555 0104", payRate: 200000, startDate: new Date("2021-11-01") },
    { email: "restaurant@grandpalms.ng", role: "RT", firstName: "Chidi", lastName: "Eze", department: "Restaurant", phone: "+234 802 555 0105", payRate: 160000, startDate: new Date("2022-07-18") },
  ];

  const userIds: Record<string, string> = {};
  for (const [i, u] of demoUsers.entries()) {
    const id = nanoid();
    userIds[u.role] = id;
    db.insert(users).values({
      id,
      organizationId: orgId,
      branchId,
      email: u.email,
      passwordHash,
      role: u.role,
      firstName: u.firstName,
      lastName: u.lastName,
      status: "active",
      createdAt: now,
      employeeId: `EMP-${String(i + 1).padStart(4, "0")}`,
      department: u.department,
      phone: u.phone,
      payRateKobo: toKobo(u.payRate),
      startDate: u.startDate,
    }).run();
  }

  // A handful of rooms so the Reservation Grid and Housekeeping Board
  // aren't empty on first load. Mixed housekeepingStatus so the HK board
  // demos meaningfully out of the box.
  const roomDefs = [
    { number: "101", type: "Standard", floor: "1", hk: "dirty" as const, priority: false, dnd: false, assign: true },
    { number: "102", type: "Standard", floor: "1", hk: "clean" as const, priority: false, dnd: false, assign: false },
    { number: "103", type: "Deluxe", floor: "1", hk: "in_progress" as const, priority: true, dnd: false, assign: true },
    { number: "201", type: "Deluxe", floor: "2", hk: "inspected" as const, priority: false, dnd: false, assign: false },
    { number: "202", type: "Deluxe", floor: "2", hk: "clean" as const, priority: false, dnd: true, assign: false },
    { number: "301", type: "Suite", floor: "3", hk: "dirty" as const, priority: false, dnd: false, assign: false },
  ];
  const roomIds: string[] = [];
  for (const r of roomDefs) {
    const id = nanoid();
    roomIds.push(id);
    db.insert(rooms).values({
      id, branchId, number: r.number, type: r.type, floor: r.floor,
      status: "available", housekeepingStatus: r.hk, priority: r.priority, dnd: r.dnd,
      assignedAttendantId: r.assign ? userIds["HK"] : null,
    }).run();
  }

  // One sample guest + reservation so Check-In/Folio/Check-Out have
  // something real to operate on right away.
  const guestId = nanoid();
  db.insert(guests).values({
    id: guestId,
    branchId,
    firstName: "Chinedu",
    lastName: "Nwosu",
    email: "chinedu.nwosu@example.com",
    phone: "+234 802 555 0134",
    idType: "National ID",
    idNumber: "NIN-0042318877",
    vip: false,
    blacklisted: false,
    nationality: "Nigerian",
    createdAt: now,
  }).run();

  const checkIn = new Date();
  const checkOut = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const liveReservationId = nanoid();
  db.insert(reservations).values({
    id: liveReservationId,
    branchId,
    guestId,
    roomId: roomIds[0],
    checkInDate: checkIn,
    checkOutDate: checkOut,
    status: "confirmed",
    rateKobo: toKobo(42000),
    adults: 1,
    children: 0,
    createdBy: userIds["FD"],
    createdAt: now,
  }).run();
  // Seeded reservations must claim their room-nights too (B3). The seed
  // writes to the tables directly rather than going through the routes, so
  // without this a freshly seeded database has reservations that hold no
  // inventory -- and the double-booking guard would happily let the API
  // rebook a room the demo data already occupies.
  claimRoomNights(branchId, roomIds[0], liveReservationId, checkIn, checkOut);

  // A handful of completed/cancelled/no-show stays in the recent past so
  // RP-01 Occupancy, RP-02 Revenue, and RP-04 Guest Analytics have real
  // history to aggregate on first load, not just the one live in-house
  // reservation above.
  const historyDefs = [
    { first: "Amara", last: "Bello", nationality: "Nigerian", room: 1, nightsAgo: 6, nights: 3, status: "checked_out" as const, rate: 38000 },
    { first: "John", last: "Smith", nationality: "British", room: 3, nightsAgo: 10, nights: 2, status: "checked_out" as const, rate: 55000 },
    { first: "John", last: "Smith", nationality: "British", room: 3, nightsAgo: 4, nights: 2, status: "checked_out" as const, rate: 55000 }, // repeat stay
    { first: "Kwame", last: "Mensah", nationality: "Ghanaian", room: 4, nightsAgo: 8, nights: 1, status: "cancelled" as const, rate: 42000 },
    { first: "Ifeoma", last: "Uche", nationality: "Nigerian", room: 5, nightsAgo: 3, nights: 1, status: "no_show" as const, rate: 42000 },
  ];
  const historyGuestIds: Record<string, string> = {};
  for (const h of historyDefs) {
    const key = `${h.first} ${h.last}`;
    if (!historyGuestIds[key]) {
      const id = nanoid();
      historyGuestIds[key] = id;
      db.insert(guests).values({ id, branchId, firstName: h.first, lastName: h.last, nationality: h.nationality, vip: false, blacklisted: false, createdAt: now }).run();
    }
    const resId = nanoid();
    const hCheckIn = new Date(now.getTime() - h.nightsAgo * 24 * 60 * 60 * 1000);
    const hCheckOut = new Date(hCheckIn.getTime() + h.nights * 24 * 60 * 60 * 1000);
    db.insert(reservations).values({
      id: resId, branchId, guestId: historyGuestIds[key], roomId: roomIds[h.room],
      checkInDate: hCheckIn, checkOutDate: hCheckOut, status: h.status, rateKobo: toKobo(h.rate),
      adults: 1, children: 0, createdBy: userIds["FD"], createdAt: hCheckIn,
    }).run();
    // Cancelled and no-show stays never occupied the room, so they claim
    // nothing -- matching migration 0003's backfill rule exactly.
    if (h.status !== "cancelled" && h.status !== "no_show") {
      claimRoomNights(branchId, roomIds[h.room], resId, hCheckIn, hCheckOut);
    }
    if (h.status === "checked_out") {
      const amountKobo = mulKobo(toKobo(h.rate), h.nights);
      db.insert(folioCharges).values({
        id: nanoid(), reservationId: resId, category: "Room", description: `Room charge (${h.nights} nights)`,
        quantity: h.nights, unitPriceKobo: toKobo(h.rate), amountKobo, postedBy: userIds["FD"], postedAt: hCheckIn,
        businessDate: businessDateOf(hCheckIn),
      }).run();
      db.insert(payments).values({ id: nanoid(), reservationId: resId, amountKobo, method: "card", receivedBy: userIds["FD"], receivedAt: hCheckOut, businessDate: businessDateOf(hCheckOut) }).run();
    }
  }

  // Menu + tables so Restaurant/POS isn't empty on first load.
  const menu: Record<string, string[][]> = {
    Mains: [["Jollof Rice & Grilled Chicken", "6500"], ["Pepper Soup (Goat)", "7000"], ["Suya Platter", "5500"]],
    Drinks: [["Chapman", "3000"], ["Bottled Water", "1000"], ["Zobo", "1500"]],
    Desserts: [["Puff Puff (6pc)", "2000"], ["Chin Chin", "1800"]],
  };
  for (const [catName, items] of Object.entries(menu)) {
    const catId = nanoid();
    db.insert(menuCategories).values({ id: catId, branchId, name: catName, sortOrder: 0 }).run();
    for (const [name, price] of items) {
      db.insert(menuItems).values({ id: nanoid(), branchId, categoryId: catId, name, priceKobo: toKobo(Number(price)), available: true }).run();
    }
  }
  for (const label of ["T01", "T02", "T03", "T04", "T05", "T06"]) {
    db.insert(restaurantTables).values({ id: nanoid(), branchId, label, seats: 4, status: "available" }).run();
  }

  // Fixed department channels for Internal Chat (CO-01).
  for (const name of ["All Staff", "Front Desk", "Housekeeping", "Maintenance", "Restaurant"]) {
    db.insert(chatChannels).values({ id: nanoid(), branchId, type: "department", name, createdAt: now }).run();
  }

  // Products across a few categories -- Linen ones double as HK-06's data.
  const productDefs = [
    { code: "LIN-001", name: "Bath Towels", category: "Linen", unit: "pcs", stock: 45, par: 80, reorder: 30, cost: 3500 },
    { code: "LIN-002", name: "Bed Sheets (Queen)", category: "Linen", unit: "sets", stock: 62, par: 100, reorder: 40, cost: 8000 },
    { code: "LIN-003", name: "Cleaning Cloths", category: "Linen", unit: "pcs", stock: 12, par: 50, reorder: 20, cost: 500 },
    { code: "TOI-001", name: "Shampoo Bottles (Guest)", category: "Toiletries", unit: "pcs", stock: 8, par: 40, reorder: 20, cost: 350 },
    { code: "KIT-001", name: "Rice (50kg bag)", category: "F&B", unit: "kg", stock: 120, par: 200, reorder: 80, cost: 45000 },
  ];
  const productIds: string[] = [];
  for (const p of productDefs) {
    const id = nanoid();
    productIds.push(id);
    db.insert(products).values({
      id, branchId, itemCode: p.code, name: p.name, category: p.category, unit: p.unit,
      currentStock: p.stock, parLevel: p.par, reorderThreshold: p.reorder, unitCostKobo: toKobo(p.cost), updatedAt: now,
    }).run();
  }

  db.insert(suppliers).values({
    id: nanoid(), branchId, name: "Abuja Hospitality Supplies Ltd",
    contact: "Ifeoma Chukwu", phone: "+234 803 111 2222", category: "Linen & Toiletries", paymentTerms: "Net 30",
  }).run();

  // HR-04 Attendance: the past 5 days for a couple of operational staff, so
  // Attendance and Payroll (which deducts for "absent" days) aren't empty.
  const dayMs = 24 * 60 * 60 * 1000;
  const fdPattern = ["present", "present", "present", "late", "present"];
  const hkPattern = ["present", "absent", "present", "present", "present"];
  for (let i = 0; i < 5; i++) {
    const date = new Date(now.getTime() - (4 - i) * dayMs).toISOString().slice(0, 10);
    db.insert(attendance).values({ id: nanoid(), branchId, userId: userIds["FD"], date, status: fdPattern[i], recordedBy: userIds["MGT"], recordedAt: now }).run();
    db.insert(attendance).values({ id: nanoid(), branchId, userId: userIds["HK"], date, status: hkPattern[i], recordedBy: userIds["MGT"], recordedAt: now }).run();
  }

  // HR-04: one pending leave request waiting for a manager decision.
  db.insert(leaveRequests).values({
    id: nanoid(), branchId, userId: userIds["MX"],
    startDate: new Date(now.getTime() + 3 * dayMs).toISOString().slice(0, 10),
    endDate: new Date(now.getTime() + 5 * dayMs).toISOString().slice(0, 10),
    reason: "Family event", status: "pending", requestedAt: now,
  }).run();

  // HR-05 Shift Scheduler: current week, published, for the operational roles.
  const shiftPattern: Record<string, string[]> = {
    FD: ["Morning", "Morning", "Morning", "Evening", "Evening", "Off", "Off"],
    HK: ["Morning", "Morning", "Off", "Morning", "Morning", "Morning", "Off"],
    RT: ["Evening", "Evening", "Morning", "Morning", "Off", "Evening", "Evening"],
  };
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
  for (const [role, pattern] of Object.entries(shiftPattern)) {
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart.getTime() + i * dayMs).toISOString().slice(0, 10);
      db.insert(shifts).values({ id: nanoid(), branchId, userId: userIds[role], date, shiftType: pattern[i], published: true, createdBy: userIds["MGT"], createdAt: now }).run();
    }
  }

  // HR-02 Management Notes: one on record so the tab isn't empty on first load.
  db.insert(staffNotes).values({
    id: nanoid(), branchId, userId: userIds["FD"], note: "Completed advanced guest-relations training, Q1 2026.",
    createdBy: userIds["MGT"], createdAt: now,
  }).run();

  console.log("[seed] Done. Demo accounts (password: demo123):");
  for (const u of demoUsers) console.log(`  ${u.email}  (${u.role})`);
}

seed()
  .catch((err) => {
    console.error("[seed] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
