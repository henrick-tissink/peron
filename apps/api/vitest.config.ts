import { defineConfig } from "vitest/config";

const live = process.env.PERON_LIVE === "1";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: live
      ? ["test/**/*.test.ts", "test/**/*.live.test.ts"]
      : ["test/**/*.test.ts"],
    exclude: live ? [] : ["test/**/*.live.test.ts"],
  },
});
