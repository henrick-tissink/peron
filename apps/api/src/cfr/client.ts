import { toStationSlug } from "./slug.js";
import { BootstrapError, CaptchaError, UpstreamError } from "./errors.js";
import { toFormBody } from "./form.js";

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

export type CfrSession = {
  cookie: string;
  confirmationKey: string;
  requestVerificationToken: string;
};

export type SearchParams = {
  from: string;
  to: string;
  date: string; // ISO YYYY-MM-DD
};

function toCfrDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) throw new Error(`invalid ISO date: ${iso}`);
  return `${d}.${m}.${y} 00:00:00`;
}

export async function searchRaw(
  session: CfrSession,
  params: SearchParams,
): Promise<string> {
  const body = toFormBody({
    DepartureStationName: params.from.replace(/[ȘșŞş]/g, "s").replace(/[ȚțŢţ]/g, "t").normalize("NFD").replace(/\p{Diacritic}/gu, ""),
    ArrivalStationName: params.to.replace(/[ȘșŞş]/g, "s").replace(/[ȚțŢţ]/g, "t").normalize("NFD").replace(/\p{Diacritic}/gu, ""),
    DepartureDate: toCfrDate(params.date),
    ConfirmationKey: session.confirmationKey,
    __RequestVerificationToken: session.requestVerificationToken,
    PassengerCount: "1",
    IsInternational: "false",
  });

  const res = await fetch(`${CFR_BASE}/ro-RO/Itineraries/GetItineraries`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "cookie": session.cookie,
      "x-requested-with": "XMLHttpRequest",
      "accept": "text/html,application/xhtml+xml",
    },
    body,
  });

  if (res.status >= 500) {
    throw new UpstreamError(`GetItineraries returned ${res.status}`, res.status);
  }

  const html = await res.text();
  if (html.trim() === "ReCaptchaFailed" || html.includes("ReCaptchaFailed")) {
    throw new CaptchaError("search hit captcha");
  }

  if (res.status >= 400) {
    throw new UpstreamError(`GetItineraries returned ${res.status}`, res.status);
  }

  return html;
}
