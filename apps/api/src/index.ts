import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN_API) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN_API,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
    ...(process.env.GIT_COMMIT_SHA ? { release: process.env.GIT_COMMIT_SHA } : {}),
  });
}

import { serve } from "@hono/node-server";
import { pathToFileURL } from "node:url";
import { app } from "./app.js";
import { rosterStations } from "./cfr/board-roster.js";

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const port = Number(process.env.PORT) || 3001;
  serve({ fetch: app.fetch, port });
  console.log(`api listening on :${port}`);

  if (process.env.NODE_ENV === "production") {
    setTimeout(async () => {
      const top = rosterStations().slice(0, 5);
      for (const slug of top) {
        try {
          await fetch(`http://127.0.0.1:${port}/api/board/${slug}?direction=departures`);
        } catch { /* warm-up best-effort, ignore */ }
      }
    }, 30_000); // 30s after boot
  }
}

export { app };
