import { describe, it, expect } from "vitest";
import type { Station } from "@peron/types";
import { app } from "../src/index.js";

describe("GET /health", () => {
  it("responds 200 with { status: 'ok' }", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});

describe("GET /stations/sample", () => {
  it("returns a typed Station from @peron/types", async () => {
    const res = await app.request("/stations/sample");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Station;
    expect(body.name).toBe("București Nord");
    expect(body.isImportant).toBe(true);
  });
});
