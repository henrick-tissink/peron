import { serve } from "@hono/node-server";
import { Hono } from "hono";

export const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3001);
  serve({ fetch: app.fetch, port });
  console.log(`api listening on :${port}`);
}
