import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclip.ministry-example";
export const HEARTBEAT_JOB = "ministry.heartbeat";
export const GET_CURRENT_TIME_TOOL = "ministry.get_current_time";
export const LAST_TICK_DATA_KEY = "ministry.last-tick";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Ministry Example",
  description: "Trivial reference plugin exercising worker, cron job, event subscription, agent tool, dashboard widget, and one capability.",
  author: "Plugin Author",
  categories: ["connector"],
  capabilities: [
    "events.subscribe",
    "issues.read",
    "jobs.schedule",
    "agent.tools.register",
    "ui.dashboardWidget.register",
    "plugin.state.read",
    "plugin.state.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  jobs: [
    {
      jobKey: HEARTBEAT_JOB,
      displayName: "Ministry Heartbeat",
      description: "Heartbeat job — fires every 5 minutes and records the tick timestamp.",
      schedule: "*/5 * * * *",
    },
  ],
  tools: [
    {
      name: GET_CURRENT_TIME_TOOL,
      displayName: "Ministry Current Time",
      description: "Returns the current time as an ISO-8601 timestamp.",
      parametersSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: "ministry-widget",
        displayName: "Ministry Example",
        exportName: "DashboardWidget",
      },
    ],
  },
};

export default manifest;
