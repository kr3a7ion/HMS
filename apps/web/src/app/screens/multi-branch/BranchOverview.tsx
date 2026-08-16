// MB-01 Branch Overview. Real data from the local server's synced cache
// (GET /sync/status), which was populated by the last successful pull from
// the central server -- see server/src/services/sync.ts and ROADMAP.md's
// Phase 3 entry for why this shows every branch (including this one) from
// the same "last synced" snapshot rather than mixing live-local with
// stale-remote data. First real screen extracted out of the old
// Screens.tsx monolith into src/app/screens/<module>/ per Guidelines §2.
import { useEffect, useState } from "react";
import { MapPin, Plus, Building2 } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { PageHeader, BtnP, EmptyState } from "../../Screens";
import { type AddToast, PRIMARY, SUCCESS, WARNING, ERROR, BORDER, TEXT, MUTED, SUBTLE } from "../../data";
import { syncApi, type CachedBranch } from "../../lib/api";

export function BranchOverview({ add }: { add: AddToast }) {
  const [branches, setBranches] = useState<CachedBranch[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    syncApi.status()
      .then(s => { setConfigured(s.configured); setBranches(s.branches); })
      .catch(() => add({ type: "error", title: "Couldn't load branch overview" }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  if (!configured) {
    return (
      <div>
        <PageHeader title="Branch Overview" sub="All branches under this organization" />
        <div className="bg-white rounded-xl border" style={{ borderColor: BORDER }}>
          <EmptyState icon={Building2} message="This branch isn't paired with a central server yet — Multi-Branch views need sync configured first. See Settings > Synchronization." />
        </div>
      </div>
    );
  }

  const withData = branches.filter(b => b.snapshotAt != null);

  return (
    <div>
      <PageHeader title="Branch Overview" sub="All branches under this organization — from the last sync" actions={<BtnP label="Add New Branch" icon={Plus} onClick={() => add({ type: "info", title: "Contact your Platform Owner or Org Super Admin", body: "New branches are provisioned centrally, not from a branch's local app." })} />} />
      {branches.length === 0 ? (
        <div className="bg-white rounded-xl border" style={{ borderColor: BORDER }}><EmptyState icon={Building2} message="No branch data cached yet — press Sync Now in Settings > Synchronization." /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">{branches.map(b => (
            <div key={b.branchId} className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
              <div className="flex items-start justify-between mb-4">
                <div><h3 className="text-base font-bold" style={{ color: TEXT }}>{b.branchName}</h3><div className="flex items-center gap-1.5 text-xs mt-0.5" style={{ color: MUTED }}><MapPin size={11} />Manager: {b.branchManagerName ?? "—"}</div></div>
                <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: b.lastSyncStatus === "ok" ? SUCCESS : b.lastSyncStatus === "error" ? ERROR : WARNING }}><span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.lastSyncStatus === "ok" ? SUCCESS : b.lastSyncStatus === "error" ? ERROR : WARNING }} />{b.lastSyncStatus === "ok" ? "Synced" : b.lastSyncStatus === "error" ? "Sync Error" : "Never Synced"}</div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { l: "Occupancy", v: b.occupancyRate != null ? `${b.occupancyRate}%` : "—", c: (b.occupancyRate ?? 0) > 80 ? SUCCESS : WARNING },
                  { l: "Revenue Today", v: b.revenueTodayKobo != null ? `₦${b.revenueTodayKobo.toLocaleString()}` : "—", c: TEXT },
                  { l: "Open Issues", v: b.openIssues ?? "—", c: (b.openIssues ?? 0) > 5 ? ERROR : SUCCESS },
                  { l: "Total Rooms", v: b.roomsTotal ?? "—", c: TEXT },
                ].map(s => <div key={s.l} className="rounded-lg p-3" style={{ backgroundColor: "#F8FAFC" }}><div className="text-lg font-bold" style={{ color: s.c }}>{s.v}</div><div className="text-xs" style={{ color: MUTED }}>{s.l}</div></div>)}
              </div>
              <div className="pt-3 border-t flex items-center justify-between text-xs" style={{ borderColor: "#F1F5F9" }}>
                <div style={{ color: SUBTLE }}>{b.snapshotAt ? `Snapshot from ${new Date(b.snapshotAt).toLocaleString()}` : "No snapshot yet"}</div>
              </div>
            </div>
          ))}</div>
          {withData.length > 0 && (
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
              <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Occupancy Comparison</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={withData.map(b => ({ name: b.branchName, occ: b.occupancyRate ?? 0 }))} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v}%`, "Occupancy"]} />
                  <Bar key="branch-occ-bar" dataKey="occ" name="Occupancy" fill={PRIMARY} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
