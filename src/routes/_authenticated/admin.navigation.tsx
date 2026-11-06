import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { hasPermission } from "@/lib/roles";
import {
  getNavigationConfigAdmin,
  saveNavigationConfigAdmin,
  resetNavigationConfigAdmin,
  type MergedNavItem,
} from "@/lib/admin/navigation-manager.functions";
import {
  Menu,
  Save,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Smartphone,
  Monitor,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Tag,
  Search,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/navigation")({
  head: () => ({ meta: [{ title: "Navigation Manager · Superadmin Console — EagleBABA" }] }),
  component: AdminNavigationPage,
});

function AdminNavigationPage() {
  const { role, user: currentAuthUser } = useAuth();
  const getNav = useServerFn(getNavigationConfigAdmin);
  const saveNav = useServerFn(saveNavigationConfigAdmin);
  const resetNav = useServerFn(resetNavigationConfigAdmin);

  const isSuperadmin =
    role === "superadmin" || currentAuthUser?.email === "lwillshivansh@gmail.com";
  const hasAccess = isSuperadmin || hasPermission(role, "admin.console");

  const [items, setItems] = useState<MergedNavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedSection, setSelectedSection] = useState<string>("ALL");

  useEffect(() => {
    let mounted = true;
    getNav()
      .then((data) => {
        if (mounted && Array.isArray(data)) {
          setItems(data);
        }
      })
      .catch((e) => {
        if (mounted) setErr((e as Error).message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [getNav]);

  if (!hasAccess) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="card-institutional p-8 inline-block max-w-md">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-zinc-100">Superadmin Access Required</h2>
          <p className="text-sm text-zinc-400 mt-2">
            The Navigation Manager is restricted to Superadmin operators. Please switch to an
            authorized administrative session.
          </p>
        </div>
      </div>
    );
  }

  const handleMove = (index: number, direction: "up" | "down") => {
    const newItems = [...items];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newItems.length) return;

    // Swap order values
    const currentOrder = newItems[index].order;
    const targetOrder = newItems[targetIndex].order;
    newItems[index].order = targetOrder;
    newItems[targetIndex].order = currentOrder;

    // Swap in array
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;

    setItems([...newItems]);
  };

  const handleUpdate = (id: string, updates: Partial<MergedNavItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const payload = items.map((it) => ({
        id: it.id,
        label: it.label,
        order: it.order,
        desktopVisible: it.desktopVisible,
        mobileVisible: it.mobileVisible,
        minRole: it.minRole,
        badge: it.badge,
      }));
      const res = await saveNav({ data: payload });
      if (res.success) {
        setItems(res.items);
        const map: Record<string, unknown> = {};
        for (const item of payload) {
          map[item.id] = item;
        }
        try {
          localStorage.setItem("eb_nav_overrides", JSON.stringify(map));
        } catch {}
        setMsg("Navigation configuration saved and applied globally!");
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset navigation configuration to default system registry?")) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await resetNav();
      if (res.success) {
        setItems(res.items);
        try {
          localStorage.removeItem("eb_nav_overrides");
        } catch {}
        setMsg("Navigation reset to system registry defaults!");
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  const filteredItems = items.filter((it) => {
    const matchesSection = selectedSection === "ALL" || it.section === selectedSection;
    const matchesSearch =
      search.trim() === "" ||
      it.label.toLowerCase().includes(search.toLowerCase()) ||
      it.id.toLowerCase().includes(search.toLowerCase()) ||
      (it.to && it.to.toLowerCase().includes(search.toLowerCase()));
    return matchesSection && matchesSearch;
  });

  return (
    <div className="w-full max-w-[1800px] mx-auto px-2 sm:px-4 lg:px-6 py-4 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Menu className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Navigation & Menu Bar Manager
            </h1>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
              Superadmin
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Configure desktop sidebar items, mobile drawer visibility, role-based access limits,
            and custom badge labels.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-xs font-mono text-zinc-300 transition-colors disabled:opacity-50"
          >
            <RotateCcw size={14} />
            Reset Defaults
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-colors shadow-[0_0_12px_rgba(245,158,11,0.3)] disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? "Saving..." : "Save Navigation Layout"}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {msg && (
        <div className="card-institutional p-3 flex items-center gap-2 text-xs text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{msg}</span>
        </div>
      )}
      {err && (
        <div className="card-institutional p-3 flex items-center gap-2 text-xs text-rose-400 border-rose-500/30 bg-rose-500/10">
          <AlertCircle size={16} className="shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {/* Filters Bar */}
      <div className="card-institutional p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
          {["ALL", "CORE", "ANALYTICS", "ALERTS", "INTELLIGENCE", "SYSTEM"].map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => setSelectedSection(sec)}
              className={`px-3 py-1 rounded-md text-xs font-mono transition-colors ${
                selectedSection === sec
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "text-zinc-400 hover:text-zinc-200 bg-zinc-900/40 border border-zinc-800"
              }`}
            >
              {sec}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-2.5 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search links..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-200 outline-none focus:border-amber-500/40"
          />
        </div>
      </div>

      {/* Items List */}
      <div className="card-institutional p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60 font-mono text-[11px] text-zinc-400 uppercase tracking-wider">
                <th className="py-3 px-3 w-16 text-center">Order</th>
                <th className="py-3 px-4">Item & Path</th>
                <th className="py-3 px-4">Display Label</th>
                <th className="py-3 px-3 text-center">Desktop</th>
                <th className="py-3 px-3 text-center">Mobile</th>
                <th className="py-3 px-4">Min Role</th>
                <th className="py-3 px-4">Custom Badge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {filteredItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <tr
                    key={item.id}
                    className="hover:bg-zinc-900/40 transition-colors group"
                  >
                    {/* Reorder Buttons */}
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMove(index, "up")}
                          disabled={index === 0}
                          className="p-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 disabled:opacity-30 disabled:hover:text-zinc-400"
                          title="Move up"
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMove(index, "down")}
                          disabled={index === filteredItems.length - 1}
                          className="p-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 disabled:opacity-30 disabled:hover:text-zinc-400"
                          title="Move down"
                        >
                          <ArrowDown size={13} />
                        </button>
                      </div>
                    </td>

                    {/* Item info */}
                    <td className="py-2.5 px-4 font-sans">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-md bg-zinc-800/60 border border-zinc-700/60 text-amber-400 shrink-0">
                          <Icon size={14} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-zinc-100 flex items-center gap-2">
                            <span>{item.id}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                              {item.section}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-zinc-500 truncate">
                            {item.to ?? item.href}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Label Input */}
                    <td className="py-2.5 px-4">
                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) => handleUpdate(item.id, { label: e.target.value })}
                        className="w-full px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-sans focus:border-amber-500/50 outline-none"
                      />
                    </td>

                    {/* Desktop Visibility Toggle */}
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdate(item.id, { desktopVisible: !item.desktopVisible })
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] transition-colors ${
                          item.desktopVisible
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                            : "bg-zinc-900 text-zinc-500 border border-zinc-800"
                        }`}
                      >
                        <Monitor size={12} />
                        <span>{item.desktopVisible ? "Show" : "Hide"}</span>
                      </button>
                    </td>

                    {/* Mobile Visibility Toggle */}
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdate(item.id, { mobileVisible: !item.mobileVisible })
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] transition-colors ${
                          item.mobileVisible
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                            : "bg-zinc-900 text-zinc-500 border border-zinc-800"
                        }`}
                      >
                        <Smartphone size={12} />
                        <span>{item.mobileVisible ? "Show" : "Hide"}</span>
                      </button>
                    </td>

                    {/* Min Role Select */}
                    <td className="py-2.5 px-4">
                      <select
                        value={item.minRole ?? "guest"}
                        onChange={(e) =>
                          handleUpdate(item.id, {
                            minRole: e.target.value as MergedNavItem["minRole"],
                          })
                        }
                        className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs outline-none focus:border-amber-500/40"
                      >
                        <option value="guest">guest (Public)</option>
                        <option value="user">user (Registered)</option>
                        <option value="pro">pro (Subscribers)</option>
                        <option value="admin">admin (Staff)</option>
                        <option value="superadmin">superadmin (Operator)</option>
                      </select>
                    </td>

                    {/* Custom Badge Input */}
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <Tag size={12} className="text-zinc-500 shrink-0" />
                        <input
                          type="text"
                          value={item.badge ?? ""}
                          onChange={(e) => handleUpdate(item.id, { badge: e.target.value })}
                          placeholder="e.g. HOT, NEW"
                          className="w-24 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs uppercase focus:border-amber-500/40 outline-none"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
