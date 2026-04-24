import { cors } from "hono/cors";

const PROD_ORIGIN = process.env.PERON_WEB_ORIGIN ?? "https://peron.app";
const DEV_ORIGIN = "http://localhost:3000";
const ALLOWED = new Set([PROD_ORIGIN, DEV_ORIGIN]);

export const corsMiddleware = cors({
  origin: (origin) => (ALLOWED.has(origin) ? origin : null),
  allowMethods: ["GET", "POST"],
  credentials: false,
  maxAge: 600,
});
