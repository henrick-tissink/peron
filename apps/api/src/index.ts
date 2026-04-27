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

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const port = Number(process.env.PORT) || 3001;
  serve({ fetch: app.fetch, port });
  console.log(`api listening on :${port}`);
}

export { app };
