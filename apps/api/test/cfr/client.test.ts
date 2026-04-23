import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { http, HttpResponse } from "msw";
import { server } from "../setup.js";
import { bootstrap } from "../../src/cfr/client.js";
import { BootstrapError, CaptchaError } from "../../src/cfr/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(__dirname, "../fixtures");
const CFR_BASE = "https://bilete.cfrcalatori.ro";

describe("bootstrap", () => {
  it("extracts cookie + tokens from a well-formed Rute-trenuri page", async () => {
    const html = await readFile(resolve(FIX, "bootstrap-rute-trenuri.html"), "utf8");
    server.use(
      http.get(`${CFR_BASE}/ro-RO/Rute-trenuri/:from/:to`, () =>
        new HttpResponse(html, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "set-cookie": ".AspNetCore.Session=CfDJ8example; path=/; httponly",
          },
        }),
      ),
    );

    const result = await bootstrap("Bucuresti-Nord", "Brasov");
    expect(result.cookie).toContain(".AspNetCore.Session=");
    expect(result.confirmationKey.length).toBeGreaterThan(0);
    expect(result.requestVerificationToken.length).toBeGreaterThan(0);
  });

  it("throws BootstrapError when tokens missing from page", async () => {
    server.use(
      http.get(`${CFR_BASE}/ro-RO/Rute-trenuri/:from/:to`, () =>
        new HttpResponse("<html><body>no tokens here</body></html>", {
          status: 200,
          headers: { "content-type": "text/html", "set-cookie": "sess=abc" },
        }),
      ),
    );

    await expect(bootstrap("Bucuresti-Nord", "Brasov")).rejects.toBeInstanceOf(BootstrapError);
  });

  it("throws CaptchaError when response body is ReCaptchaFailed", async () => {
    server.use(
      http.get(`${CFR_BASE}/ro-RO/Rute-trenuri/:from/:to`, () =>
        new HttpResponse("ReCaptchaFailed", { status: 200 }),
      ),
    );

    await expect(bootstrap("Bucuresti-Nord", "Brasov")).rejects.toBeInstanceOf(CaptchaError);
  });

  it("transliterates station names in the URL path", async () => {
    let capturedPath = "";
    server.use(
      http.get(`${CFR_BASE}/ro-RO/Rute-trenuri/:from/:to`, ({ params }) => {
        capturedPath = `${params["from"]}/${params["to"]}`;
        return new HttpResponse(
          `<html><input name="__RequestVerificationToken" value="tok" /><input name="ConfirmationKey" value="key" /></html>`,
          { status: 200, headers: { "set-cookie": "s=1" } },
        );
      }),
    );

    await bootstrap("București Nord", "Brașov");
    expect(capturedPath).toBe("Bucuresti-Nord/Brasov");
  });
});
