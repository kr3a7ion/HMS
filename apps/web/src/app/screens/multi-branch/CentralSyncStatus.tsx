// MB-03 Central Sync Status. Real data from this branch's own sync state
// plus its cached view of every branch in the org. "Force Sync" only
// re-syncs THIS branch -- a branch-local server has no channel to remotely
// trigger a different physical branch's local server; each branch only
// ever talks to the central server, never to another branch directly. See
// ROADMAP.md.
import { useEffect, useState } from "react";
import { RefreshCw, Building2 } from "lucide-react";
import { PageHeader, BtnP, Badge, EmptyState } from "../../Screens";
import { type AddToast, SUCCESS, WARNING, ERROR, BORDER, TEXT, SUBTLE } from "../../data";
import { syncApi, type SyncStatus } from "../../lib/api";

export function CentralSyncStatus({ add }: { add: AddToast }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = () => syncApi.status().then(setStatus).catch(() => add({ type: "error", title: "Couldn't load sync status" })).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const forceSync = async () => {
    setSyncing(true);
    try {
      const result = await syncApi.syncNow();
      add({ type: result.push.ok && result.pull.ok ? "success" : "warning", title: "Sync triggered for this branch", body: !result.push.ok ? `Push: ${result.push.error}` : !result.pull.ok ? `Pull: ${result.pull.error}` : undefined });
      setLoading(true); load();
    } catch { add({ type: "error", title: "Sync failed" }); }
    finally { setSyncing(false); }
  };

  if (loading || !status) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  if (!status.configured) {
    return (
      <div>
        <PageHeader title="Central Sync Status" sub="Branch-by-branch sync health" />
        <div className="bg-white rounded-xl border" style={{ borderColor: BORDER }}><EmptyState icon={Building2} message="This branch isn't paired with a central server yet." /></div>
      </div>
    );
  }

  const synced = status.branches.filter(b => b.lastSyncStatus === "ok").length;

  return (
    <div>
      <PageHeader title="Central Sync Status" sub="Branch-by-branch sync health · Central server" actions={<BtnP label={syncing ? "Syncing…" : "Force Sync (this branch)"} icon={RefreshCw} onClick={forceSync} />} />
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[{ l: "Branches Synced", v: `${synced}/${status.branches.length}`, c: synced === status.branches.length ? SUCCESS : WARNING }, { l: "Pending Items", v: String(status.pendingItemCount), c: TEXT }, { l: "This Branch's Last Sync", v: status.lastPullAt ? new Date(status.lastPullAt).toLocaleTimeString() : "Never", c: TEXT }].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border text-center" style={{ borderColor: BORDER }}><div className="text-2xl font-bold mb-1" style={{ color: s.c }}>{s.v}</div><div className="text-xs uppercase tracking-wider" style={{ color: SUBTLE }}>{s.l}</div></div>)}
      </div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Branch Sync Status</h3></div>
        {status.branches.length === 0 ? <EmptyState icon={Building2} message="No branches cached yet." /> : status.branches.map(b => (
          <div key={b.branchId} className="flex items-center gap-4 px-5 py-4 border-b hover:bg-[#FAFBFD]" style={{ borderColor: "#F8FAFC" }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: b.lastSyncStatus === "ok" ? "#DCFCE7" : b.lastSyncStatus === "error" ? "#FEE2E2" : "#FEF3C7" }}>
              <RefreshCw size={16} style={{ color: b.lastSyncStatus === "ok" ? SUCCESS : b.lastSyncStatus === "error" ? ERROR : WARNING }} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold" style={{ color: TEXT }}>{b.branchName}</div>
              <div className="text-xs mt-0.5" style={{ color: SUBTLE }}>Last sync: {b.lastSyncAt ? new Date(b.lastSyncAt).toLocaleString() : "Never"}</div>
            </div>
            <Badge label={b.lastSyncStatus === "ok" ? "Synced" : b.lastSyncStatus === "error" ? "Error" : "Never Synced"} colors={b.lastSyncStatus === "ok" ? { bg: "#DCFCE7", text: "#166534" } : b.lastSyncStatus === "error" ? { bg: "#FEE2E2", text: "#991B1B" } : { bg: "#FEF3C7", text: "#92400E" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
