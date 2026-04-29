import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { stations, searchResponse, priceResponse, boardDeparturesResponse, boardArrivalsResponse } from "./fixtures.js";

const app = new Hono();

// Enable CORS for all origins (needed for E2E tests)
app.use("*", cors({ origin: "*" }));

app.get("/health", (c) => c.text("ok"));

app.get("/api/stations", (c) => {
  const q = c.req.query("q")?.toLowerCase() ?? "";
  const limitStr = c.req.query("limit");
  const limit = limitStr ? Math.max(1, Math.min(500, Number(limitStr))) : stations.length;
  const filtered = q
    ? stations.filter((s) => s.name.toLowerCase().includes(q))
    : stations;
  return c.json({ stations: filtered.slice(0, limit), total: filtered.length });
});

app.post("/api/search", async (c) => {
  await c.req.json();
  return c.json(searchResponse);
});

app.post("/api/price", async (c) => {
  await c.req.json();
  return c.json(priceResponse);
});

app.get("/api/board/:slug", (c) => {
  const direction = c.req.query("direction") ?? "departures";
  return c.json(direction === "arrivals" ? boardArrivalsResponse : boardDeparturesResponse);
});

const port = Number(process.env.MOCK_PORT ?? 3002);
serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`[peron-web mock] listening on :${port}`);
});
