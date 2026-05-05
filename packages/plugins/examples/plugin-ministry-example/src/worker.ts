import {
  definePlugin,
  runWorker,
  type PluginContext,
  type ToolResult,
} from "@paperclipai/plugin-sdk";
import {
  GET_CURRENT_TIME_TOOL,
  HEARTBEAT_JOB,
  LAST_TICK_DATA_KEY,
} from "./manifest.js";

const LAST_TICK_STATE_KEY = "lastTick";

type LastTick = { iso: string; trigger: string };

async function readLastTick(ctx: PluginContext): Promise<LastTick | null> {
  return (await ctx.state.get({ scopeKind: "instance", stateKey: LAST_TICK_STATE_KEY })) as LastTick | null;
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("ministry-example setup");

    ctx.jobs.register(HEARTBEAT_JOB, async (job) => {
      const tick: LastTick = { iso: new Date().toISOString(), trigger: job.trigger };
      await ctx.state.set({ scopeKind: "instance", stateKey: LAST_TICK_STATE_KEY }, tick);
      ctx.logger.info("ministry heartbeat", tick);
    });

    ctx.events.on("issue.updated", async (event) => {
      const issueId = event.entityId;
      if (!issueId) return;
      const issue = await ctx.issues.get(issueId, event.companyId).catch(() => null);
      const stage = issue?.status ?? "unknown";
      ctx.logger.info(`patch ${issueId} reached ${stage}`);
    });

    ctx.tools.register(
      GET_CURRENT_TIME_TOOL,
      {
        displayName: "Ministry Current Time",
        description: "Returns the current time as an ISO-8601 timestamp.",
        parametersSchema: { type: "object", properties: {} },
      },
      async (): Promise<ToolResult> => {
        const iso = new Date().toISOString();
        return { content: iso, data: { iso } };
      },
    );

    ctx.data.register(LAST_TICK_DATA_KEY, async () => {
      return (await readLastTick(ctx)) ?? { iso: null, trigger: null };
    });
  },

  async onHealth() {
    return { status: "ok", message: "ministry-example worker running" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
