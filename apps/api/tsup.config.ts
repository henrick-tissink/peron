import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  bundle: true,
  // Inline @peron/types because it ships raw .ts (no build step). Everything
  // else stays external — production node_modules is shipped in the runtime
  // Docker image. Attempts to bundle pino, cheerio, etc. fail because their
  // CJS internals use dynamic requires that don't survive ESM bundling.
  noExternal: ["@peron/types"],
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  shims: false,
  minify: false,
});
