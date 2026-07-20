import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  DASHBOARD_WIDGETS,
  LEGACY_DASHBOARD_WIDGETS,
  CRYPTO_DASHBOARD_WIDGETS,
  type WidgetDefinition,
} from "@/lib/dashboard-widgets";
import {
  getDisabledWidgetIds,
  setWidgetDisabled,
  resetWidgetToggles,
} from "@/lib/admin-widget-toggles";
import { useAdminDisabledWidgets } from "@/hooks/use-admin-widget-toggles";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/admin/widgets")({
  head: () => ({
    meta: [
      { title: "Widget Toggles — Admin" },
      { name: "description", content: "Enable or disable individual dashboard widgets." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminWidgetTogglesPage,
});

type Group = { key: string; label: string; widgets: WidgetDefinition[] };

function AdminWidgetTogglesPage() {
  const { role } = useAuth();
  const disabled = useAdminDisabledWidgets();
  const [filter, setFilter] = useState("");

  const groups: Group[] = useMemo(
    () => [
      { key: "legacy", label: "Main Dashboard", widgets: LEGACY_DASHBOARD_WIDGETS },
      { key: "crypto", label: "Crypto Dashboard", widgets: CRYPTO_DASHBOARD_WIDGETS },
      { key: "abstract", label: "Registry Widgets", widgets: DASHBOARD_WIDGETS },
    ],
    [],
  );

  const q = filter.trim().toLowerCase();
  const totalDisabled = disabled.size;

  if (role !== "admin") {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card className="p-6">
          <h1 className="text-lg font-semibold">Admin access required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Only administrators can toggle dashboard widgets.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Widget Toggles</h1>
          <p className="text-sm text-muted-foreground">
            Turn individual dashboard cards on or off. Changes apply immediately across
            the dashboard for this browser.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{totalDisabled} disabled</Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetWidgetToggles()}
            disabled={totalDisabled === 0}
          >
            Enable all
          </Button>
        </div>
      </header>

      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search widgets…"
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        aria-label="Search widgets"
      />

      {groups.map((group) => {
        const items = group.widgets.filter(
          (w) => !q || w.id.toLowerCase().includes(q) || w.title.toLowerCase().includes(q),
        );
        if (items.length === 0) return null;
        return (
          <Card key={group.key} className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">{group.label}</h2>
              <span className="text-xs text-muted-foreground">{items.length} widgets</span>
            </div>
            <ul className="divide-y">
              {items.map((w) => {
                const isOff = disabled.has(w.id);
                return (
                  <li
                    key={`${group.key}:${w.id}`}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{w.title}</span>
                        {w.required ? (
                          <Badge variant="outline" className="text-[10px]">
                            required
                          </Badge>
                        ) : null}
                        <Badge variant="secondary" className="text-[10px]">
                          {w.section}
                        </Badge>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        id: <code>{w.id}</code> · plan: {w.minimumPlan}
                        {w.featureFlag ? ` · flag: ${w.featureFlag}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {isOff ? "Off" : "On"}
                      </span>
                      <Switch
                        checked={!isOff}
                        onCheckedChange={(checked) => setWidgetDisabled(w.id, !checked)}
                        aria-label={`Toggle ${w.title}`}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}

      <p className="text-xs text-muted-foreground">
        Preferences are stored locally in this browser ({getDisabledWidgetIds().size} disabled).
        This override affects presentation only — no formulas, APIs, or decision logic are
        modified.
      </p>
    </div>
  );
}

export default AdminWidgetTogglesPage;