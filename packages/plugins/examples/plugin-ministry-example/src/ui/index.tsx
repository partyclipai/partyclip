import { usePluginData, type PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";
import { LAST_TICK_DATA_KEY } from "../manifest.js";

type LastTick = { iso: string | null; trigger: string | null };

export function DashboardWidget(_props: PluginWidgetProps) {
  const { data, loading, error } = usePluginData<LastTick>(LAST_TICK_DATA_KEY);

  if (loading) return <div>Loading…</div>;
  if (error) return <div>Plugin error: {error.message}</div>;

  const last = data?.iso ?? "never";
  return <div>Hello from the plugin · last tick: {last}</div>;
}
