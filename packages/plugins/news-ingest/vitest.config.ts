import { defineConfig } from "vitest/config";

// Local config so vitest does not pick up the workspace-root projects list
// when run from this package.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
