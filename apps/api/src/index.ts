import { serve } from "@hono/node-server";
import type { Station } from "@peron/types";
import { Hono } from "hono";
import { pathToFileURL } from "node:url";

export const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

// SCAFFOLDING: proves @peron/types wiring; remove when /api/stations lands (Plan 2)
app.get("/stations/sample", (c) => {
  const sample: Station = { name: "București Nord", isImportant: true };
  return c.json(sample);
});

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const port = Number(process.env.PORT) || 3001;
  serve({ fetch: app.fetch, port });
  console.log(`api listening on :${port}`);
}
