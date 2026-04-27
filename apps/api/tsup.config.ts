import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  bundle: true,
  external: [
    // pino ecosystem
    "pino",
    "thread-stream",
    "sonic-boom",
    "pino-pretty",
  ],
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  shims: false,
  minify: false,
});
