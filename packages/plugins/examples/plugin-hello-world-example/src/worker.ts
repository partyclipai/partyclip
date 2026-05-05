import { definePlugin, runWorker } from "@partyclipai/plugin-sdk";
import type { PluginJobContext, ToolResult } from "@partyclipai/plugin-sdk";

const PLUGIN_NAME = "hello-world-example";
const HEALTH_MESSAGE = "Hello World example plugin ready";
const HEARTBEAT_JOB_KEY = "hello-world-heartbeat";
const GREET_TOOL_NAME = "greet";

/**
 * Worker lifecycle hooks for the Hello World reference plugin.
 *
 * Stays small enough to use as a copy-paste scaffold, but exercises the
 * four core SDK surfaces a real plugin needs: UI slot (declared in the
 * manifest), scheduled job, host service call, and agent-callable tool.
 */
const plugin = definePlugin({
  /**
   * Called when the host starts the plugin worker.
   * Registers a scheduled job and an agent-callable tool.
   */
  async setup(ctx) {
    ctx.logger.info(`${PLUGIN_NAME} plugin setup complete`);

    // Scheduled job: fires hourly per the manifest cron schedule.
    // Demonstrates a host service call (ctx.companies.list).
    ctx.jobs.register(HEARTBEAT_JOB_KEY, async (job: PluginJobContext) => {
      const companies = await ctx.companies.list({ limit: 100, offset: 0 });
      ctx.logger.info("hello-world heartbeat fired", {
        runId: job.runId,
        trigger: job.trigger,
        companyCount: companies.length,
      });
    });

    // Agent-callable tool: agents that opt in can invoke
    // partyclip.hello-world-example:greet.
    ctx.tools.register(
      GREET_TOOL_NAME,
      {
        displayName: "Hello World Greet",
        description: "Returns a friendly greeting. Smoke test of tool registration.",
        parametersSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Optional name to greet." },
          },
        },
      },
      async (params): Promise<ToolResult> => {
        const name = (params as { name?: string }).name?.trim() || "world";
        return {
          content: `hello, ${name}`,
          data: { greeted: name },
        };
      },
    );
  },

  /**
   * Called by the host health probe endpoint.
   */
  async onHealth() {
    return { status: "ok", message: HEALTH_MESSAGE };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
