import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { hasPermission } from "@/lib/roles";
import {
  listTelegramChannelsAdmin,
  saveTelegramChannelAdmin,
  deleteTelegramChannelAdmin,
  toggleTelegramChannelStatusAdmin,
  testTelegramChannelAdmin,
  listTelegramDeliveryLogsAdmin,
  type TelegramChannelConfig,
  type AlertFilterType,
} from "@/lib/admin/telegram-manager.functions";
import type { AlertDeliveryRow } from "@/lib/notifications/alert-delivery.functions";
import {
  Send,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Radio,
  Layers,
  ShieldAlert,
  RotateCcw,
  RefreshCw,
  Zap,
  Activity,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/telegram")({
  head: () => ({ meta: [{ title: "Telegram Channels · Superadmin Console — EagleBABA" }] }),
  component: AdminTelegramPage,
});

function AdminTelegramPage() {
  const { role, user: currentAuthUser } = useAuth();
  const listChannels = useServerFn(listTelegramChannelsAdmin);
  const saveChannel = useServerFn(saveTelegramChannelAdmin);
  const deleteChannel = useServerFn(deleteTelegramChannelAdmin);
  const toggleStatus = useServerFn(toggleTelegramChannelStatusAdmin);
  const testChannel = useServerFn(testTelegramChannelAdmin);
  const listLogs = useServerFn(listTelegramDeliveryLogsAdmin);

  const isSuperadmin =
    role === "superadmin" ||
    currentAuthUser?.email === "lwillshivansh@gmail.com" ||
    currentAuthUser?.email === "dheerajnarula13@gmail.com";
  const hasAccess = isSuperadmin || hasPermission(role, "admin.console");

  const [activeTab, setActiveTab] = useState<"channels" | "logs">("channels");
  const [channels, setChannels] = useState<TelegramChannelConfig[]>([]);
  const [logs, setLogs] = useState<readonly AlertDeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<TelegramChannelConfig | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<{
    id?: string;
    title: string;
    chatId: string;
    botToken: string;
    alertFilter: AlertFilterType;
    status: "active" | "paused";
  }>({
    title: "",
    chatId: "",
    botToken: "",
    alertFilter: "all",
    status: "active",
  });

  const reload = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [chs, lgs] = await Promise.all([listChannels(), listLogs()]);
      setChannels(chs);
      setLogs(lgs);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  if (!hasAccess) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="card-institutional p-8 inline-block max-w-md">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-zinc-100">Superadmin Access Required</h2>
          <p className="text-sm text-zinc-400 mt-2">
            Dynamic Telegram Channels management is restricted to Superadmin operators.
          </p>
        </div>
      </div>
    );
  }

  const handleOpenAddModal = () => {
    setEditingChannel(null);
    setFormData({
      title: "",
      chatId: "",
      botToken: "",
      alertFilter: "all",
      status: "active",
    });
    setModalOpen(true);
  };

  const handleOpenEditModal = (ch: TelegramChannelConfig) => {
    setEditingChannel(ch);
    setFormData({
      id: ch.id,
      title: ch.title,
      chatId: ch.chatId,
      botToken: ch.botToken || "",
      alertFilter: ch.alertFilter,
      status: ch.status,
    });
    setModalOpen(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      const res = await saveChannel({
        data: {
          id: formData.id,
          title: formData.title,
          chatId: formData.chatId,
          botToken: formData.botToken.trim() || undefined,
          alertFilter: formData.alertFilter,
          status: formData.status,
        },
      });
      if (res.success) {
        setChannels(res.channels);
        setModalOpen(false);
        setMsg(`Channel "${formData.title}" saved successfully!`);
        setTimeout(() => setMsg(null), 3000);
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete channel "${title}"?`)) return;
    try {
      const res = await deleteChannel({ data: { id } });
      if (res.success) {
        setChannels(res.channels);
        setMsg(`Channel "${title}" removed.`);
        setTimeout(() => setMsg(null), 3000);
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      const res = await toggleStatus({ data: { id } });
      if (res.success) {
        setChannels(res.channels);
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const handleTestPing = async (id: string) => {
    setTestingId(id);
    setErr(null);
    try {
      const res = await testChannel({ data: { id } });
      if (res.success) {
        setMsg(`Test ping delivered! Latency: ${res.latencyMs}ms`);
        // Refresh channel in state
        setChannels((prev) => prev.map((c) => (c.id === id ? res.channel : c)));
      } else {
        setErr(`Delivery failed (${res.error}). Latency: ${res.latencyMs}ms`);
        setChannels((prev) => prev.map((c) => (c.id === id ? res.channel : c)));
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setTestingId(null);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  return (
    <div className="w-full max-w-[1800px] mx-auto px-2 sm:px-4 lg:px-6 py-4 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Telegram Channels Manager
            </h1>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
              Superadmin
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Broadcast quantitative alerts, Gann reversals, and Astro anomalies across multiple
            Telegram channels with custom filters and latency monitoring.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-xs font-mono text-zinc-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-colors shadow-[0_0_12px_rgba(245,158,11,0.3)]"
          >
            <Plus size={14} />
            Add Channel
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

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800/80">
        <button
          type="button"
          onClick={() => setActiveTab("channels")}
          className={`px-4 py-2 text-xs font-mono font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "channels"
              ? "border-amber-400 text-amber-300"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Radio size={14} />
          <span>Active Channels ({channels.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("logs")}
          className={`px-4 py-2 text-xs font-mono font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "logs"
              ? "border-amber-400 text-amber-300"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Activity size={14} />
          <span>Delivery History ({logs.length})</span>
        </button>
      </div>

      {/* Tab 1: Channels List */}
      {activeTab === "channels" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map((ch) => {
            const isTesting = testingId === ch.id;
            return (
              <div
                key={ch.id}
                className="card-institutional p-5 flex flex-col justify-between gap-4 transition-all"
              >
                <div className="flex flex-col gap-3">
                  {/* Top Bar: Title & Status Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-zinc-100 truncate">{ch.title}</h3>
                      <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5 mt-0.5">
                        <span>Chat ID:</span>
                        <span className="text-zinc-300 bg-zinc-800/80 px-1.5 py-0.2 rounded font-mono text-[10px]">
                          {ch.chatId}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggle(ch.id)}
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border transition-colors ${
                        ch.status === "active"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : "bg-zinc-800 text-zinc-500 border-zinc-700"
                      }`}
                    >
                      {ch.status}
                    </button>
                  </div>

                  {/* Filter & Bot Token Info */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      Filter: {ch.alertFilter.toUpperCase()}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {ch.botToken ? "Custom Bot Token" : "Default Global Bot"}
                    </span>
                  </div>

                  {/* Last Dispatch Latency Metric */}
                  <div className="p-2.5 rounded-lg bg-black/40 border border-zinc-800/80 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-1.5 text-zinc-400">
                      <Clock size={13} />
                      <span>Last Dispatch:</span>
                    </div>
                    {ch.lastDispatchAt ? (
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[11px] font-bold ${
                            ch.lastStatus === "DELIVERED" ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {ch.lastLatencyMs ? `${ch.lastLatencyMs}ms` : ch.lastStatus}
                        </span>
                      </div>
                    ) : (
                      <span className="text-zinc-600">No pings yet</span>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-zinc-800/60">
                  <button
                    type="button"
                    onClick={() => handleTestPing(ch.id)}
                    disabled={isTesting || ch.status !== "active"}
                    className="flex-1 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-mono text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
                  >
                    <Zap size={13} className={isTesting ? "animate-bounce" : ""} />
                    <span>{isTesting ? "Pinging..." : "Send Test Ping"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(ch)}
                    className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                    title="Edit Channel"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(ch.id, ch.title)}
                    className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 transition-colors"
                    title="Delete Channel"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 2: Delivery Logs */}
      {activeTab === "logs" && (
        <div className="card-institutional p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 font-mono text-[11px] text-zinc-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Attempted At</th>
                  <th className="py-3 px-4">Event Title</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Priority</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-500">
                      No Telegram delivery attempts recorded yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-zinc-900/40 transition-colors">
                      <td className="py-2.5 px-4 text-zinc-400 whitespace-nowrap">
                        {new Date(log.attempted_at).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 font-sans font-semibold text-zinc-200">
                        {log.event?.title ?? log.fingerprint.slice(0, 16)}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-400">
                        {log.event?.type ?? "GENERIC"}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                            log.event?.priority === "CRITICAL"
                              ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                              : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                          }`}
                        >
                          {log.event?.priority ?? "NORMAL"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                            log.status === "DELIVERED"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-rose-500/20 text-rose-400"
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-zinc-300">
                        {log.duration_ms ? `${log.duration_ms}ms` : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Channel Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="card-institutional max-w-lg w-full p-6 flex flex-col gap-4 border border-amber-500/30">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                <Send size={16} className="text-amber-400" />
                <span>{editingChannel ? "Edit Telegram Channel" : "Add Telegram Channel"}</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase text-zinc-400">Channel Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. VIP Signals & Reversals"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 outline-none focus:border-amber-500/40"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase text-zinc-400">
                  Telegram Chat ID
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. -100234567890 or @ChannelUsername"
                  value={formData.chatId}
                  onChange={(e) => setFormData({ ...formData, chatId: e.target.value })}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 font-mono outline-none focus:border-amber-500/40"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase text-zinc-400">
                  Custom Bot Token (Optional)
                </label>
                <input
                  type="password"
                  placeholder="Leave empty to use server default TELEGRAM_BOT_TOKEN"
                  value={formData.botToken}
                  onChange={(e) => setFormData({ ...formData, botToken: e.target.value })}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 font-mono outline-none focus:border-amber-500/40"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono uppercase text-zinc-400">
                    Alert Filter Route
                  </label>
                  <select
                    value={formData.alertFilter}
                    onChange={(e) =>
                      setFormData({ ...formData, alertFilter: e.target.value as AlertFilterType })
                    }
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 outline-none focus:border-amber-500/40"
                  >
                    <option value="all">All Alerts</option>
                    <option value="gann">Gann Levels & Squares</option>
                    <option value="astro">Astro Harmonics & Cycles</option>
                    <option value="decision">Decision Signals</option>
                    <option value="vix">VIX Volatility Alerts</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono uppercase text-zinc-400">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        status: e.target.value as "active" | "paused",
                      })
                    }
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 outline-none focus:border-amber-500/40"
                  >
                    <option value="active">Active (Broadcasting)</option>
                    <option value="paused">Paused (Silent)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-1.5 rounded-lg border border-zinc-800 text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs font-mono transition-colors shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                >
                  Save Channel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
