// MB-02 Branch Comparison. Real data, but deliberately scoped to a
// point-in-time snapshot comparison -- the local server only caches each
// branch's *latest* pulled snapshot (branch_sync_cache has one row per
// branch, not history). Real historical trend comparison across many syncs
// exists centrally (central-server's GET /org/comparison, backed by the
// append-only branch_snapshots table) and is only reachable through the
// Org Portal's central-authenticated session -- see OrgPortal.tsx. A
// branch-local screen showing "trend" from a single cached row would be
// fabricating a series that doesn't exist at this layer.
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { PageHeader, BtnO, EmptyState } from "../../Screens";
import { type AddToast, PRIMARY, TEAL, BORDER, TEXT, MUTED, SUBTLE } from "../../data";
import { syncApi, type CachedBranch } from "../../lib/api";

export function BranchComparison({ add }: { add: AddToast }) {
  const [branches, setBranches] = useState<CachedBranch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    syncApi.status().then(s => setBranches(s.branches.filter(b => b.snapshotAt != null))).catch(() => add({ type: "error", title: "Couldn't load branch comparison" })).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  return (
    <div>
      <PageHeader title="Branch Comparison" sub="Side-by-side KPI snapshot across branches — from the last sync, not a historical trend (see the Org Portal for that)" actions={<BtnO label="Export Report" icon={Download} onClick={() => add({ type: "info", title: "Export isn't wired to a file yet" })} />} />
      {branches.length === 0 ? (
        <div className="bg-white rounded-xl border" style={{ borderColor: BORDER }}><EmptyState icon={Download} message="No synced branch data yet — press Sync Now in Settings > Synchronization." /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
              <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Occupancy % by Branch</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={branches.map(b => ({ name: b.branchName, occ: b.occupancyRate ?? 0 }))} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v}%`, "Occupancy"]} />
                  <Bar key="comp-occ" dataKey="occ" name="Occupancy" fill={PRIMARY} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
              <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Revenue Today (₦) by Branch</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={branches.map(b => ({ name: b.branchName, rev: b.revenueTodayKobo ?? 0 }))} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`₦${v.toLocaleString()}`, "Revenue"]} />
                  <Bar key="comp-rev" dataKey="rev" name="Revenue" fill={TEAL} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>KPI Comparison Table</h3></div>
            <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Metric", ...branches.map(b => b.branchName)].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
              <tbody>{[
                { metric: "Occupancy %", fmt: (b: CachedBranch) => b.occupancyRate != null ? `${b.occupancyRate}%` : "—" },
                { metric: "Revenue Today (₦)", fmt: (b: CachedBranch) => b.revenueTodayKobo != null ? `₦${b.revenueTodayKobo.toLocaleString()}` : "—" },
                { metric: "ADR (₦)", fmt: (b: CachedBranch) => b.adrKobo != null ? `₦${b.adrKobo.toLocaleString()}` : "—" },
                { metric: "RevPAR (₦)", fmt: (b: CachedBranch) => b.revparKobo != null ? `₦${b.revparKobo.toLocaleString()}` : "—" },
                { metric: "Open Issues", fmt: (b: CachedBranch) => b.openIssues ?? "—" },
              ].map(row => <tr key={row.metric} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{row.metric}</td>{branches.map(b => <td key={b.branchId} className="px-5 py-3 text-sm font-bold" style={{ color: PRIMARY }}>{row.fmt(b)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
