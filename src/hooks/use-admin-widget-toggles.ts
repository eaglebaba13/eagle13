import { useEffect, useState } from "react";
import { getDisabledWidgetIds, subscribeWidgetToggles } from "@/lib/admin-widget-toggles";

export function useAdminDisabledWidgets(): ReadonlySet<string> {
  const [disabled, setDisabled] = useState<ReadonlySet<string>>(() => new Set<string>());
  useEffect(() => {
    setDisabled(getDisabledWidgetIds());
    return subscribeWidgetToggles(setDisabled);
  }, []);
  return disabled;
}