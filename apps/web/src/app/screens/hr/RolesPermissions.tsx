// Extracted from the former Screens.tsx monolith per Guidelines §2.
// HR-03: real, DB-backed roles & permissions (server/src/auth/permissionKeys.ts,
// routes/hr.ts's /roles endpoints) -- editing a role's permissions here
// changes what that role's users can actually do at every requirePermission()
// gate in the app, and invalidates their active sessions immediately (the
// permissions_hash mismatch check in server/src/auth/middleware.ts), not
// cosmetic. See ROADMAP.md for how the built-in roles' exact permission
// grants were derived to preserve prior behavior exactly.
import { useState, useEffect } from "react";
import { Plus, Trash2, Users as UsersIcon, Shield } from "lucide-react";
import { hrApi, type RoleSummary, type RoleDetail } from "../../lib/api";
import { type Toast, PRIMARY, TEAL, ERROR, BORDER, TEXT, MUTED, SUBTLE } from "../../data";
import { PageHeader, BtnP, EmptyState } from "../../Screens";

export function RolesPermissions({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [roleList, setRoleList] = useState<RoleSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RoleDetail | null>(null);
  const [pending, setPending] = useState<string[] | "*">([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");

  const loadList = () => hrApi.listRoles().then(rows => {
    setRoleList(rows);
    if (!activeId && rows.length > 0) setActiveId(rows[0].id);
  }).catch(() => add({ type: "error", title: "Couldn't load roles" })).finally(() => setLoading(false));

  useEffect(() => { loadList(); }, []);

  useEffect(() => {
    if (!activeId) return;
    hrApi.getRole(activeId).then(d => { setDetail(d); setPending(d.permissions); })
      .catch(() => add({ type: "error", title: "Couldn't load role detail" }));
  }, [activeId]);

  const toggle = (key: string) => {
    if (pending === "*") return; // full-access roles aren't toggled key-by-key
    setPending(p => (p as string[]).includes(key) ? (p as string[]).filter(k => k !== key) : [...(p as string[]), key]);
  };

  const save = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await hrApi.updateRolePermissions(detail.id, pending);
      add({ type: "success", title: "Permissions saved", body: "Anyone with this role and an active session will be signed out and need to log back in." });
      loadList();
    } catch { add({ type: "error", title: "Couldn't save permissions" }); }
    finally { setSaving(false); }
  };

  const createRole = async () => {
    if (!newRoleName.trim()) return;
    try {
      const res = await hrApi.createRole({ name: newRoleName.trim(), permissions: [] });
      setShowCreate(false); setNewRoleName("");
      await loadList();
      setActiveId(res.id);
      add({ type: "success", title: `${newRoleName} created`, body: "Now pick its permissions and save." });
    } catch { add({ type: "error", title: "Couldn't create role" }); }
  };

  const removeRole = async () => {
    if (!detail || detail.isSystemRole) return;
    try {
      await hrApi.deleteRole(detail.id);
      add({ type: "success", title: `${detail.name} deleted` });
      setActiveId(null); setDetail(null);
      loadList();
    } catch (e: any) {
      add({ type: "error", title: e?.code === "ROLE_IN_USE" ? "Can't delete — staff are still assigned to this role" : "Couldn't delete role" });
    }
  };

  if (loading) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  const grouped = detail ? detail.catalog.reduce<Record<string, typeof detail.catalog>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {}) : {};

  return (
    <div>
      <PageHeader title="Roles & Permissions" sub="Module-level permission matrix per role" actions={<BtnP label="Create Custom Role" icon={Plus} onClick={() => setShowCreate(true)} />} />
      <div className="flex gap-4">
        <div className="w-56 flex-shrink-0 bg-white rounded-xl border p-2" style={{ borderColor: BORDER }}>
          {roleList.map(r => (
            <button key={r.id} onClick={() => setActiveId(r.id)} className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-colors flex items-center justify-between" style={{ backgroundColor: activeId === r.id ? PRIMARY : "transparent", color: activeId === r.id ? "white" : MUTED }}>
              <span>{r.name}</span>
              <span className="text-xs" style={{ color: activeId === r.id ? "rgba(255,255,255,0.7)" : SUBTLE }}>{r.userCount}</span>
            </button>
          ))}
        </div>
        <div className="flex-1 bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
          {!detail ? <EmptyState icon={Shield} message="Select a role to view its permissions." /> : (
            <>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}>
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: TEXT }}>
                    {detail.name}
                    {detail.isSystemRole && <span className="text-xs font-normal px-1.5 py-0.5 rounded" style={{ backgroundColor: "#F1F5F9", color: MUTED }}>Built-in</span>}
                  </h3>
                  <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: SUBTLE }}><UsersIcon size={12} />{detail.users.length} {detail.users.length === 1 ? "user" : "users"}: {detail.users.slice(0, 4).map(u => `${u.firstName} ${u.lastName}`).join(", ")}{detail.users.length > 4 ? "…" : ""}{detail.users.length === 0 && "none currently"}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!detail.isSystemRole && <button onClick={removeRole} disabled={detail.users.length > 0} className="text-xs font-medium px-3 py-1.5 rounded-lg border disabled:opacity-40" style={{ color: ERROR, borderColor: `${ERROR}30` }} title={detail.users.length > 0 ? "Reassign staff off this role first" : "Delete role"}><Trash2 size={13} className="inline mr-1" />Delete</button>}
                  <button onClick={save} disabled={saving || pending === "*"} className="text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-50" style={{ backgroundColor: PRIMARY }}>{saving ? "Saving…" : "Save Changes"}</button>
                </div>
              </div>
              {pending === "*" ? (
                <div className="p-5 text-sm" style={{ color: MUTED }}>This role has unrestricted access to every module — nothing to toggle. (Platform Owner, Organization Super Admin, and Branch Manager are full-access by design, per Blueprint Part 2.4.)</div>
              ) : (
                <div className="p-4 space-y-5">
                  {Object.entries(grouped).map(([module, keys]) => (
                    <div key={module}>
                      <h4 className="text-xs font-semibold uppercase tracking-wider mb-1.5 px-3" style={{ color: SUBTLE }}>{module}</h4>
                      <div className="space-y-1">
                        {keys.map(p => {
                          const enabled = (pending as string[]).includes(p.key);
                          return (
                            <div key={p.key} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-[#F8FAFC]">
                              <span className="text-sm" style={{ color: TEXT }}>{p.label}</span>
                              <label className="cursor-pointer" onClick={() => toggle(p.key)}>
                                <div className="w-10 h-5 rounded-full relative transition-colors" style={{ backgroundColor: enabled ? TEAL : "#CBD5E1" }}>
                                  <div className="absolute w-4 h-4 bg-white rounded-full top-0.5 shadow transition-all" style={{ left: enabled ? 22 : 2 }} />
                                </div>
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showCreate && (
        <>
          <div className="fixed inset-0 z-40" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setShowCreate(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ border: `1px solid ${BORDER}` }}>
            <h3 className="text-base font-semibold mb-4" style={{ color: TEXT }}>New Custom Role</h3>
            <label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Role Name</label>
            <input value={newRoleName} onChange={e => setNewRoleName(e.target.value)} onKeyDown={e => e.key === "Enter" && createRole()} placeholder="e.g. Night Auditor" autoFocus className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none" style={{ borderColor: BORDER }} />
            <p className="text-xs mt-2" style={{ color: SUBTLE }}>Starts with no permissions — pick them from the matrix after creating.</p>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl text-sm border" style={{ color: MUTED, borderColor: BORDER }}>Cancel</button>
              <button onClick={createRole} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white" style={{ backgroundColor: PRIMARY }}>Create</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
