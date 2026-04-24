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
