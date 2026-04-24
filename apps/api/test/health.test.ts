import { describe, it, expect } from "vitest";
import { z } from "zod";
import { app } from "../src/app.js";

const HealthSchema = z.object({
  status: z.literal("ok"),
  pool: z.object({
    size: z.number().int().min(0),
    breakerOpen: z.boolean(),
  }),
  stations: z.object({
    cached: z.number().int().min(0),
  }),
});

describe("GET /health", () => {
  it("responds 200 with a well-formed health payload", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = HealthSchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });
});
