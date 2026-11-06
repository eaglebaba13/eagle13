import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  listUsersAdmin,
  updateUserRoleAdmin,
  updateUserSubscriptionAdmin,
  toggleUserStatusAdmin,
  createUserAdmin,
  deleteUserAdmin,
  type UserAdminItem,
  type UserStatus,
} from "@/lib/admin/user-management.functions";
import { ROLES, type AppRole, ROLE_LABELS, hasPermission } from "@/lib/roles";
import {
  Users,
  Search,
  Filter,
  Download,
  UserPlus,
  RefreshCw,
  Edit2,
  Trash2,
  Calendar,
  Shield,
  Crown,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "User Management · Superadmin Console — EagleBABA" }] }),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const { role, user: currentAuthUser } = useAuth();
  const listUsers = useServerFn(listUsersAdmin);
  const updateRole = useServerFn(updateUserRoleAdmin);
  const updateSub = useServerFn(updateUserSubscriptionAdmin);
  const toggleStatus = useServerFn(toggleUserStatusAdmin);
  const createUser = useServerFn(createUserAdmin);
  const deleteUser = useServerFn(deleteUserAdmin);

  const isSuperadmin =
    role === "superadmin" ||
    currentAuthUser?.email === "lwillshivansh@gmail.com" ||
    currentAuthUser?.email === "dheerajnarula13@gmail.com";
  const hasAdminAccess = hasPermission(role, "admin.console") || isSuperadmin;

  // Data & Pagination State
  const [users, setUsers] = useState<UserAdminItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Notifications & Modal State
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAdminItem | null>(null);

  // Add User Form State
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("user");
  const [newPlan, setNewPlan] = useState("free");

  // Edit User Form State
  const [editRole, setEditRole] = useState<AppRole>("user");
  const [editStatus, setEditStatus] = useState<UserStatus>("active");
  const [editPlan, setEditPlan] = useState("pro");
  const [editExpiryDate, setEditExpiryDate] = useState("");

  const reload = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await listUsers({
        data: {
          search,
          role: roleFilter,
          status: statusFilter,
          page,
          pageSize,
        },
      });
      setUsers(res.users);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasAdminAccess) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAdminAccess, page, pageSize, roleFilter, statusFilter]);

  // Debounced search
  useEffect(() => {
    if (!hasAdminAccess) return;
    const timer = setTimeout(() => {
      setPage(1);
      void reload();
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  if (!hasAdminAccess) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-2xl rounded-xl border border-red-500/40 bg-red-500/[0.06] p-6 text-sm text-red-300">
          Superadmin or Admin access required to access the User Management Console.
        </div>
      </div>
    );
  }

  const handleOpenEdit = (u: UserAdminItem) => {
    setEditingUser(u);
    setEditRole(u.role);
    setEditStatus(u.status);
    setEditPlan(u.planId || "free");
    setEditExpiryDate(u.planExpiresAt ? u.planExpiresAt.slice(0, 10) : "");
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    setBusyId(editingUser.id);
    setErr(null);
    setMsg(null);
    try {
      // 1. Update role if changed
      if (editRole !== editingUser.role) {
        await updateRole({ data: { userId: editingUser.id, role: editRole } });
      }

      // 2. Update status if changed
      if (editStatus !== editingUser.status && editStatus !== "pending") {
        await toggleStatus({ data: { userId: editingUser.id, status: editStatus } });
      }

      // 3. Update subscription if changed
      const expiresAtIso = editExpiryDate ? new Date(`${editExpiryDate}T23:59:59Z`).toISOString() : null;
      if (editPlan !== editingUser.planId || expiresAtIso !== editingUser.planExpiresAt) {
        await updateSub({
          data: {
            userId: editingUser.id,
            planId: editPlan,
            planExpiresAt: expiresAtIso,
          },
        });
      }

      setMsg(`Updated account settings for ${editingUser.email}`);
      setEditingUser(null);
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleExtend30Days = async (u: UserAdminItem) => {
    setBusyId(u.id);
    setErr(null);
    setMsg(null);
    try {
      const baseDate = u.planExpiresAt && new Date(u.planExpiresAt).getTime() > Date.now()
        ? new Date(u.planExpiresAt)
        : new Date();
      baseDate.setDate(baseDate.getDate() + 30);
      const newExpiry = baseDate.toISOString();

      await updateSub({
        data: {
          userId: u.id,
          planId: u.planId === "free" ? "pro" : u.planId,
          planExpiresAt: newExpiry,
        },
      });

      setMsg(`Extended ${u.email} subscription by 30 days.`);
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setLoading(true);
    try {
      await createUser({
        data: {
          email: newEmail.trim().toLowerCase(),
          password: newPassword,
          fullName: newName.trim(),
          role: newRole,
          planId: newPlan,
        },
      });
      setMsg(`Account created successfully for ${newEmail}`);
      setShowAddModal(false);
      setNewEmail("");
      setNewPassword("");
      setNewName("");
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (u: UserAdminItem) => {
    if (!window.confirm(`Are you sure you want to permanently delete user ${u.email}? This action cannot be undone.`)) {
      return;
    }
    setBusyId(u.id);
    setErr(null);
    setMsg(null);
    try {
      await deleteUser({ data: { userId: u.id } });
      setMsg(`User ${u.email} deleted.`);
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    const headers = [
      "User ID",
      "Full Name",
      "Email",
      "Role",
      "Status",
      "Plan",
      "Plan Expiry",
      "Days Left",
      "Joined Date",
      "Last Active",
    ];
    const lines = [
      headers.join(","),
      ...users.map((u) =>
        [
          u.id,
          u.fullName,
          u.email,
          u.role,
          u.status,
          u.planName,
          u.planExpiresAt || "None",
          u.daysLeft !== null ? u.daysLeft : "Unlimited",
          u.createdAt,
          u.lastActiveAt || "Never",
        ]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eaglebaba-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderRoleBadge = (r: AppRole) => {
    if (r === "superadmin") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-300 border border-amber-400/40">
          <Crown className="w-3 h-3 text-amber-400" />
          Superadmin
        </span>
      );
    }
    if (r === "admin") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30">
          <Shield className="w-3 h-3 text-amber-400" />
          Admin
        </span>
      );
    }
    if (r === "moderator") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-300 border border-purple-500/30">
          Moderator
        </span>
      );
    }
    if (r === "enterprise" || r === "professional") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
          {ROLE_LABELS[r] || r}
        </span>
      );
    }
    if (r === "pro") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-300 border border-blue-500/30">
          Pro
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
        {ROLE_LABELS[r] || r}
      </span>
    );
  };

  const renderStatusBadge = (s: UserStatus) => {
    if (s === "active") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Active
        </span>
      );
    }
    if (s === "suspended") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-amber-400">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          Suspended
        </span>
      );
    }
    if (s === "banned") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-rose-400">
          <span className="w-2 h-2 rounded-full bg-rose-400" />
          Banned
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
        <span className="w-2 h-2 rounded-full bg-zinc-500" />
        Pending
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="w-full max-w-[1800px] mx-auto px-2 sm:px-4 lg:px-6 py-4 flex flex-col gap-6 overflow-x-hidden">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-white">User Management</h1>
                  <span className="rounded-md bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-400/30">
                    SUPERADMIN CONSOLE
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Authoritative institutional directory, RBAC governance, subscription validity, and credential provisioning.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-medium text-zinc-300 hover:bg-white/10 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-zinc-400" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-semibold text-slate-950 hover:from-amber-400 hover:to-amber-500 shadow-md shadow-amber-500/20 transition-all"
            >
              <UserPlus className="w-3.5 h-3.5" />
              + Add User
            </button>
          </div>
        </header>

        {/* Alerts / Notifications */}
        {msg && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{msg}</span>
            <button onClick={() => setMsg(null)} className="ml-auto text-emerald-400 hover:text-emerald-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {err && (
          <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs px-4 py-3">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{err}</span>
            <button onClick={() => setErr(null)} className="ml-auto text-rose-400 hover:text-rose-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Filter Controls Bar */}
        <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-4 backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto flex-1">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name, email, or user ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-zinc-950/70 pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400/50"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-zinc-400" />
              <select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-amber-400/50"
              >
                <option value="ALL">All Roles</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r] || r}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-amber-400/50"
              >
                <option value="ALL">All Statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="banned">Banned</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400">
              Total: <strong className="text-white">{total}</strong> account{total === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={reload}
              disabled={loading}
              className="p-2 rounded-lg border border-white/10 hover:bg-white/5 text-zinc-300 transition-colors disabled:opacity-50"
              title="Refresh users"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-amber-400" : ""}`} />
            </button>
          </div>
        </div>

        {/* Users Table */}
        <div className="rounded-xl border border-white/10 bg-zinc-950/70 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-zinc-900/80 text-zinc-400 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-3.5">User</th>
                  <th className="px-4 py-3.5">Role</th>
                  <th className="px-4 py-3.5">Subscription Plan</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Joined / Active</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading && users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-zinc-500">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-400 mb-2" />
                      Loading user accounts...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-zinc-500">
                      No user accounts found matching the criteria.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const isBusy = busyId === u.id;
                    const isSelf = currentAuthUser?.id === u.id;
                    return (
                      <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                        {/* User Identity */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            {u.avatarUrl ? (
                              <img
                                src={u.avatarUrl}
                                alt={u.fullName}
                                className="w-8 h-8 rounded-full object-cover border border-amber-500/30"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500/20 to-zinc-800 border border-amber-500/30 flex items-center justify-center text-amber-300 font-semibold text-xs">
                                {u.fullName.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="font-semibold text-white flex items-center gap-1.5">
                                {u.fullName}
                                {isSelf && (
                                  <span className="text-[10px] text-amber-400 font-normal">(You)</span>
                                )}
                              </span>
                              <span className="text-zinc-400 text-[11px]">{u.email}</span>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="px-4 py-3.5">
                          {renderRoleBadge(u.role)}
                        </td>

                        {/* Subscription */}
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-zinc-200">{u.planName}</span>
                            {u.daysLeft !== null ? (
                              <span
                                className={`text-[10px] inline-flex items-center gap-1 ${
                                  u.daysLeft > 7
                                    ? "text-emerald-400"
                                    : u.daysLeft > 0
                                    ? "text-amber-400"
                                    : "text-rose-400"
                                }`}
                              >
                                <Clock className="w-2.5 h-2.5" />
                                {u.daysLeft > 0 ? `${u.daysLeft} days left` : "Expired"}
                              </span>
                            ) : (
                              <span className="text-[10px] text-zinc-500">Lifetime / Free</span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5">
                          {renderStatusBadge(u.status)}
                        </td>

                        {/* Activity */}
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col text-[11px] text-zinc-400">
                            <span>Joined: {new Date(u.createdAt).toLocaleDateString()}</span>
                            <span className="text-zinc-500 text-[10px]">
                              {u.lastActiveAt ? `Active: ${new Date(u.lastActiveAt).toLocaleDateString()}` : "No sign-in yet"}
                            </span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleExtend30Days(u)}
                              disabled={isBusy}
                              title="Extend subscription by 30 days"
                              className="px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-medium transition-colors disabled:opacity-50"
                            >
                              +30d
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(u)}
                              disabled={isBusy}
                              title="Edit user details"
                              className="p-1.5 rounded hover:bg-white/10 text-zinc-300 hover:text-white transition-colors disabled:opacity-50"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {isSuperadmin && !isSelf && u.role !== "superadmin" && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                disabled={isBusy}
                                title="Delete user"
                                className="p-1.5 rounded hover:bg-rose-500/10 text-zinc-400 hover:text-rose-400 transition-colors disabled:opacity-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          <div className="border-t border-white/10 px-4 py-3 flex items-center justify-between gap-4 flex-wrap bg-zinc-900/40">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span>Show</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded border border-white/10 bg-zinc-950 px-2 py-1 text-xs text-zinc-300"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span>per page</span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-400">
                Page <strong className="text-white">{page}</strong> of{" "}
                <strong className="text-white">{totalPages}</strong>
              </span>
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="p-1.5 rounded border border-white/10 hover:bg-white/5 text-zinc-300 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="p-1.5 rounded border border-white/10 hover:bg-white/5 text-zinc-300 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal: Add User */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-zinc-950 p-6 shadow-2xl relative">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="absolute right-4 top-4 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 mb-4">
                <UserPlus className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-semibold text-white">Provision New User</h3>
              </div>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Trader Name"
                    className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="trader@eaglebaba.com"
                    className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Role</label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as AppRole)}
                      className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-400/50"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r] || r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Initial Plan</label>
                    <select
                      value={newPlan}
                      onChange={(e) => setNewPlan(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-400/50"
                    >
                      <option value="free">Free</option>
                      <option value="pro">Pro</option>
                      <option value="professional">Professional</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>
                </div>
                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="rounded-lg border border-white/10 px-4 py-2 text-xs font-medium text-zinc-400 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors disabled:opacity-50"
                  >
                    {loading ? "Creating..." : "Provision Account"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit User Access */}
        {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-zinc-950 p-6 shadow-2xl relative">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="absolute right-4 top-4 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 mb-1">
                <Edit2 className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-semibold text-white">Edit User Access</h3>
              </div>
              <p className="text-xs text-zinc-400 mb-4">{editingUser.email}</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Account Role</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as AppRole)}
                    className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-400/50"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r] || r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Account Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as UserStatus)}
                    className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-400/50"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="banned">Banned</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Subscription Plan</label>
                    <select
                      value={editPlan}
                      onChange={(e) => setEditPlan(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-400/50"
                    >
                      <option value="free">Free</option>
                      <option value="pro">Pro Monthly</option>
                      <option value="pro_annual">Pro Annual</option>
                      <option value="professional">Professional</option>
                      <option value="enterprise">Institutional Enterprise</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Expiry Date (YYYY-MM-DD)</label>
                    <input
                      type="date"
                      value={editExpiryDate}
                      onChange={(e) => setEditExpiryDate(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-400/50"
                    />
                  </div>
                </div>

                <div className="pt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="rounded-lg border border-white/10 px-4 py-2 text-xs font-medium text-zinc-400 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={busyId !== null}
                    className="rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors disabled:opacity-50"
                  >
                    {busyId ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
