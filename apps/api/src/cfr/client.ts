import { toStationSlug } from "./slug.js";
import { BootstrapError, CaptchaError } from "./errors.js";

const CFR_BASE = process.env.CFR_BASE_URL ?? "https://bilete.cfrcalatori.ro";

export type BootstrapResult = {
  cookie: string;
  confirmationKey: string;
  requestVerificationToken: string;
};

function extractCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) return "";
  return setCookieHeader
    .split(/,(?=\s*[A-Za-z_][A-Za-z0-9_.-]*=)/)
    .map((c) => c.split(";")[0]!.trim())
    .filter((c) => c.length > 0)
    .join("; ");
}

export async function bootstrap(from: string, to: string): Promise<BootstrapResult> {
  const fromSlug = toStationSlug(from);
  const toSlug = toStationSlug(to);
  const url = `${CFR_BASE}/ro-RO/Rute-trenuri/${fromSlug}/${toSlug}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "accept": "text/html,application/xhtml+xml" },
    redirect: "manual",
  });

  const body = await res.text();
  if (body.trim() === "ReCaptchaFailed") {
    throw new CaptchaError("bootstrap hit captcha");
  }

  const tokenMatch = body.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  const keyMatch = body.match(/name="ConfirmationKey"[^>]*value="([^"]+)"/);

  if (!tokenMatch?.[1] || !keyMatch?.[1]) {
    throw new BootstrapError(
      "tokens not found in Rute-trenuri page",
      `url=${url} tokenMatch=${!!tokenMatch} keyMatch=${!!keyMatch}`,
    );
  }

  const cookie = extractCookie(res.headers.get("set-cookie"));

  return {
    cookie,
    confirmationKey: keyMatch[1],
    requestVerificationToken: tokenMatch[1],
  };
}
