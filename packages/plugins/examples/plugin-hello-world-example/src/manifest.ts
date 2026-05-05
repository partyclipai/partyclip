import type { PartyclipPluginManifestV1 } from "@partyclipai/plugin-sdk";

/**
 * Stable plugin ID used by host registration and namespacing.
 */
const PLUGIN_ID = "partyclip.hello-world-example";
const PLUGIN_VERSION = "0.1.0";
const DASHBOARD_WIDGET_SLOT_ID = "hello-world-dashboard-widget";
const DASHBOARD_WIDGET_EXPORT_NAME = "HelloWorldDashboardWidget";

const JOB_KEYS = {
  heartbeat: "hello-world-heartbeat",
} as const;

const TOOL_NAMES = {
  greet: "greet",
} as const;

/**
 * Minimal manifest demonstrating the four core plugin SDK surfaces:
 * - UI slot (dashboard widget)
 * - Scheduled job (cron heartbeat)
 * - Host service call (companies.list inside the job)
 * - Agent-callable tool (greet)
 *
 * Phase 0 reference plugin: copy this shape when scaffolding a new plugin.
 */
const manifest: PartyclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Hello World (Example)",
  description: "Reference plugin: dashboard widget, scheduled job, host service call, agent-callable tool.",
  author: "partyclip",
  categories: ["ui"],
  capabilities: [
    "ui.dashboardWidget.register",
    "jobs.schedule",
    "companies.read",
    "agent.tools.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: DASHBOARD_WIDGET_SLOT_ID,
        displayName: "Hello World",
        exportName: DASHBOARD_WIDGET_EXPORT_NAME,
      },
    ],
  },
  jobs: [
    {
      jobKey: JOB_KEYS.heartbeat,
      displayName: "Hello World Heartbeat",
      description: "Logs a heartbeat once an hour and counts visible companies via the host API.",
      schedule: "0 * * * *",
    },
  ],
  tools: [
    {
      name: TOOL_NAMES.greet,
      displayName: "Hello World Greet",
      description: "Returns a friendly greeting. Smoke test of agent-callable tool registration.",
      parametersSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Optional name to greet." },
        },
      },
    },
  ],
};

export default manifest;
