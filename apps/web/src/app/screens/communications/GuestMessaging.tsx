// CO-02 Guest Messaging. Real, but honestly scoped: this is a shared
// staff-facing log/coordination tool, not an outbound WhatsApp/SMS sending
// gateway -- no third-party messaging account exists in this codebase (same
// class of gap as TTLock/Docker), and no guest-facing portal exists for an
// "internal" message to actually be delivered to. Staff record what was
// really said to (or heard from) a guest over whatever channel actually
// happened; the value is the shared, threaded record, not automated
// delivery. See server/src/db/schema.ts's guestMessageThreads comment.
import { useState, useEffect, useRef } from "react";
import { Search, Send, CheckCircle2, ArrowUpRight, Users as UsersIcon, Plus, MessageCircle } from "lucide-react";
import { guestMessagesApi, type GuestThreadSummary, type GuestThreadDetail, type InHouseGuestOption, type GuestMessageChannel, type GuestMessageDirection } from "../../lib/api";
import { type Toast, mono, PRIMARY, TEAL, SUCCESS, WARNING, ERROR, BORDER, TEXT, MUTED, SUBTLE } from "../../data";
import { PageHeader, Badge, EmptyState } from "../../Screens";

const CHANNEL_LABEL: Record<GuestMessageChannel, string> = { whatsapp: "WhatsApp", sms: "SMS", internal: "Internal / In-Person" };
const DEPARTMENTS = ["Front Desk", "Housekeeping", "Maintenance", "Restaurant"];
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open: { bg: "#EFF6FF", text: PRIMARY },
  forwarded: { bg: "#FEF3C7", text: "#92400E" },
  escalated: { bg: "#FEE2E2", text: "#991B1B" },
  resolved: { bg: "#DCFCE7", text: "#166534" },
};

export function GuestMessaging({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [threads, setThreads] = useState<GuestThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GuestThreadDetail | null>(null);
  const [search, setSearch] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeChannel, setComposeChannel] = useState<GuestMessageChannel>("whatsapp");
  const [composeDirection, setComposeDirection] = useState<GuestMessageDirection>("to_guest");
  const [sending, setSending] = useState(false);
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [inHouse, setInHouse] = useState<InHouseGuestOption[]>([]);
  const [showForward, setShowForward] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadThreads = () => guestMessagesApi.listThreads().then(rows => {
    setThreads(rows);
    if (!selectedGuestId && rows.length > 0) setSelectedGuestId(rows[0].guestId);
  }).catch(() => add({ type: "error", title: "Couldn't load guest conversations" })).finally(() => setLoading(false));

  useEffect(() => { loadThreads(); }, []);

  useEffect(() => {
    if (!selectedGuestId) { setDetail(null); return; }
    guestMessagesApi.getThread(selectedGuestId).then(setDetail).catch(() => add({ type: "error", title: "Couldn't load conversation" }));
  }, [selectedGuestId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [detail?.messages.length]);

  const openNewConvo = () => {
    guestMessagesApi.listInHouse().then(setInHouse).catch(() => add({ type: "error", title: "Couldn't load in-house guests" }));
    setShowNewConvo(true);
  };

  const startThreadWith = (guestId: string) => {
    setShowNewConvo(false);
    setSelectedGuestId(guestId);
  };

  const send = async () => {
    if (!selectedGuestId || !composeBody.trim()) return;
    setSending(true);
    try {
      await guestMessagesApi.logMessage(selectedGuestId, { channel: composeChannel, direction: composeDirection, body: composeBody.trim() });
      setComposeBody("");
      const [d] = await Promise.all([guestMessagesApi.getThread(selectedGuestId), loadThreads()]);
      setDetail(d);
    } catch { add({ type: "error", title: "Couldn't log message" }); }
    finally { setSending(false); }
  };

  const forward = async (department: string) => {
    if (!selectedGuestId) return;
    setShowForward(false);
    try {
      await guestMessagesApi.forward(selectedGuestId, department);
      add({ type: "success", title: `Forwarded to ${department}`, body: "Posted to their Internal Chat channel." });
      const [d] = await Promise.all([guestMessagesApi.getThread(selectedGuestId), loadThreads()]);
      setDetail(d);
    } catch { add({ type: "error", title: "Couldn't forward conversation" }); }
  };

  const escalate = async () => {
    if (!selectedGuestId) return;
    try {
      const res = await guestMessagesApi.escalate(selectedGuestId);
      add({ type: "success", title: "Escalated to management", body: `Notified ${res.notifiedManagers} manager${res.notifiedManagers === 1 ? "" : "s"} via Internal Chat.` });
      const [d] = await Promise.all([guestMessagesApi.getThread(selectedGuestId), loadThreads()]);
      setDetail(d);
    } catch { add({ type: "error", title: "Couldn't escalate conversation" }); }
  };

  const resolve = async () => {
    if (!selectedGuestId) return;
    try {
      await guestMessagesApi.resolve(selectedGuestId);
      add({ type: "success", title: "Marked resolved" });
      const [d] = await Promise.all([guestMessagesApi.getThread(selectedGuestId), loadThreads()]);
      setDetail(d);
    } catch { add({ type: "error", title: "Couldn't resolve conversation" }); }
  };

  const filteredThreads = threads.filter(t => !search || `${t.guestFirstName} ${t.guestLastName}`.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  return (
    <div>
      <PageHeader title="Guest Messaging" sub="A shared log of guest communications — WhatsApp, SMS, or in person — not an auto-send inbox" actions={<button onClick={openNewConvo} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg text-white" style={{ backgroundColor: PRIMARY }}><Plus size={13} />New Conversation</button>} />
      <div className="bg-white rounded-xl border flex overflow-hidden" style={{ borderColor: BORDER, height: 560 }}>
        <div className="w-64 flex-shrink-0 border-r flex flex-col" style={{ borderColor: BORDER }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: BORDER, backgroundColor: "#F8FAFC" }}><div className="relative"><Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search guests…" className="pl-7 pr-3 py-1.5 text-xs rounded-lg border bg-white outline-none w-full" style={{ borderColor: BORDER }} /></div></div>
          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
            {filteredThreads.length === 0 ? <div className="p-4"><EmptyState icon={MessageCircle} message="No conversations yet. Start one with an in-house guest." /></div> : filteredThreads.map(t => {
              const name = `${t.guestFirstName} ${t.guestLastName}`;
              const active = t.guestId === selectedGuestId;
              return (
                <button key={t.id} onClick={() => setSelectedGuestId(t.guestId)} className="w-full flex items-center gap-3 px-4 py-3 text-left border-b hover:bg-[#F8FAFC] transition-colors" style={{ borderColor: "#F8FAFC", backgroundColor: active ? "#EFF6FF" : "transparent", borderLeft: active ? `3px solid ${PRIMARY}` : "3px solid transparent" }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: t.inHouse ? PRIMARY : SUBTLE }}>{name.split(" ").map(n => n[0]).join("").slice(0, 2)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1"><div className="text-xs font-semibold truncate" style={{ color: TEXT }}>{name}</div><Badge label={t.status} colors={STATUS_COLORS[t.status] ?? { bg: "#F1F5F9", text: MUTED }} /></div>
                    <div className="text-xs truncate" style={{ color: SUBTLE }}>{t.roomNumber ? `Room ${t.roomNumber}` : "Not in-house"}{t.lastMessagePreview ? ` · ${t.lastMessagePreview}` : ""}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          {!detail ? <EmptyState icon={MessageCircle} message="Select a conversation, or start a new one." /> : (
            <>
              <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: BORDER, backgroundColor: "#F8FAFC" }}>
                <div>
                  <div className="text-sm font-semibold" style={{ color: TEXT }}>{detail.guest.firstName} {detail.guest.lastName}{detail.guest.vip && <span className="ml-1.5 text-xs font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}>VIP</span>}</div>
                  <div className="text-xs" style={{ color: SUBTLE }}>{detail.roomNumber ? `Room ${detail.roomNumber}` : "Not currently in-house"}</div>
                </div>
                <div className="flex items-center gap-2 text-xs relative">
                  <Badge label={detail.status} colors={STATUS_COLORS[detail.status] ?? { bg: "#F1F5F9", text: MUTED }} />
                  <button onClick={() => setShowForward(p => !p)} className="flex items-center gap-1 px-2 py-1.5 rounded border hover:bg-white" style={{ borderColor: BORDER, color: MUTED }}><ArrowUpRight size={12} />Forward</button>
                  {showForward && (
                    <div className="absolute right-24 top-9 z-10 bg-white rounded-lg border shadow-lg py-1 w-40" style={{ borderColor: BORDER }}>
                      {DEPARTMENTS.map(d => <button key={d} onClick={() => forward(d)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#F8FAFC]" style={{ color: TEXT }}>{d}</button>)}
                    </div>
                  )}
                  <button onClick={escalate} className="flex items-center gap-1 px-2 py-1.5 rounded border hover:bg-white" style={{ borderColor: `${ERROR}40`, color: ERROR }}><UsersIcon size={12} />Escalate</button>
                  {detail.status !== "resolved" && <button onClick={resolve} className="flex items-center gap-1 px-2 py-1.5 rounded border hover:bg-white" style={{ borderColor: `${SUCCESS}40`, color: SUCCESS }}><CheckCircle2 size={12} />Resolve</button>}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3" style={{ scrollbarWidth: "none" }}>
                {detail.messages.length === 0 && <EmptyState icon={MessageCircle} message="No messages logged yet." />}
                {detail.messages.map(m => (
                  <div key={m.id} className={`flex ${m.direction === "to_guest" ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-xs">
                      <div className="px-3 py-2 rounded-xl text-sm" style={{ backgroundColor: m.direction === "to_guest" ? PRIMARY : "#F1F5F9", color: m.direction === "to_guest" ? "white" : TEXT }}>{m.body}</div>
                      <div className="text-xs mt-1 flex gap-1.5" style={{ color: SUBTLE, justifyContent: m.direction === "to_guest" ? "flex-end" : "flex-start", fontFamily: mono }}>
                        <span>{CHANNEL_LABEL[m.channel]}</span>·<span>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>{m.loggedByFirstName && <span>· {m.loggedByFirstName}</span>}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <div className="px-5 py-3 border-t" style={{ borderColor: BORDER }}>
                <div className="flex items-center gap-3">
                  <input value={composeBody} onChange={e => setComposeBody(e.target.value)} onKeyDown={e => e.key === "Enter" && !sending && send()} placeholder={composeDirection === "to_guest" ? "Log what you told the guest…" : "Log what the guest said…"} className="flex-1 px-4 py-2.5 border rounded-xl text-sm outline-none" style={{ borderColor: BORDER }} />
                  <button onClick={send} disabled={sending || !composeBody.trim()} className="w-10 h-10 rounded-xl flex items-center justify-center text-white disabled:opacity-50" style={{ backgroundColor: PRIMARY }}><Send size={16} /></button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex gap-2">{(["whatsapp", "sms", "internal"] as const).map(c => <button key={c} onClick={() => setComposeChannel(c)} className="text-xs px-2 py-1 rounded border" style={{ color: composeChannel === c ? SUCCESS : MUTED, borderColor: composeChannel === c ? `${SUCCESS}50` : BORDER, backgroundColor: composeChannel === c ? "#F0FDF4" : "transparent" }}>{CHANNEL_LABEL[c]}</button>)}</div>
                  <div className="flex gap-1 text-xs">
                    <button onClick={() => setComposeDirection("to_guest")} className="px-2 py-1 rounded border" style={{ color: composeDirection === "to_guest" ? PRIMARY : MUTED, borderColor: composeDirection === "to_guest" ? `${PRIMARY}40` : BORDER }}>To guest</button>
                    <button onClick={() => setComposeDirection("from_guest")} className="px-2 py-1 rounded border" style={{ color: composeDirection === "from_guest" ? PRIMARY : MUTED, borderColor: composeDirection === "from_guest" ? `${PRIMARY}40` : BORDER }}>Guest said</button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showNewConvo && (
        <>
          <div className="fixed inset-0 z-40" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setShowNewConvo(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 max-h-[80vh] overflow-y-auto" style={{ border: `1px solid ${BORDER}` }}>
            <h3 className="text-base font-semibold mb-4" style={{ color: TEXT }}>Start a Conversation</h3>
            {inHouse.length === 0 ? <EmptyState icon={UsersIcon} message="No in-house guests right now." /> : (
              <div className="space-y-2">
                {inHouse.map(g => (
                  <button key={g.guestId} onClick={() => startThreadWith(g.guestId)} className="w-full flex items-center gap-3 p-3 rounded-xl border text-left hover:bg-[#F8FAFC]" style={{ borderColor: BORDER }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{g.firstName[0]}{g.lastName[0]}</div>
                    <div><div className="text-sm font-medium" style={{ color: TEXT }}>{g.firstName} {g.lastName}</div><div className="text-xs" style={{ color: SUBTLE }}>Room {g.roomNumber ?? "—"}</div></div>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setShowNewConvo(false)} className="w-full mt-4 py-2.5 rounded-xl text-sm border" style={{ color: MUTED, borderColor: BORDER }}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}
