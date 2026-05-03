import { BootstrapError, CaptchaError, UpstreamError } from "../cfr/errors.js";
import { toFormBody } from "../cfr/form.js";

const INFOFER_BASE = process.env.INFOFER_BASE_URL ?? "https://mersultrenurilor.infofer.ro";

type InfoferSession = {
  cookie: string;
  confirmationKey: string;
  requestVerificationToken: string;
  date: string; // INFOFER's preferred Date field, e.g. "03.05.2026 0:00:00"
};

function extractCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) return "";
  return setCookieHeader
    .split(/,(?=\s*[A-Za-z_][A-Za-z0-9_.-]*=)/)
    .map((c) => c.split(";")[0]!.trim())
    .filter((c) => c.length > 0)
    .join("; ");
}

async function bootstrap(slug: string): Promise<InfoferSession> {
  const url = `${INFOFER_BASE}/ro-RO/Statie/${slug}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "accept": "text/html,application/xhtml+xml" },
    redirect: "manual",
  });

  if (res.status >= 400) {
    throw new UpstreamError(`infofer bootstrap returned ${res.status}`, res.status);
  }

  const body = await res.text();
  if (body.trim() === "ReCaptchaFailed") {
    throw new CaptchaError("infofer bootstrap hit captcha");
  }

  const tokenMatch = body.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  const keyMatch = body.match(/id="ConfirmationKey"[^>]*value="([^"]+)"/);
  const dateMatch = body.match(/id="Date"[^>]*value="([^"]+)"/);

  if (!tokenMatch?.[1] || !keyMatch?.[1] || !dateMatch?.[1]) {
    throw new BootstrapError(
      "infofer tokens not found",
      `url=${url} token=${!!tokenMatch} key=${!!keyMatch} date=${!!dateMatch}`,
    );
  }

  return {
    cookie: extractCookie(res.headers.get("set-cookie")),
    confirmationKey: keyMatch[1],
    requestVerificationToken: tokenMatch[1],
    date: dateMatch[1],
  };
}

/**
 * Fetch the full station board (departures + arrivals) HTML from
 * mersultrenurilor.infofer.ro for a given station slug. INFOFER returns one
 * payload covering both directions for the day, with real-time status and
 * platform info — strictly more data than CFR's booking site exposes.
 */
export async function fetchStationBoardHtml(slug: string): Promise<string> {
  const session = await bootstrap(slug);

  const body = toFormBody({
    Date: session.date,
    StationName: slug,
    ReCaptcha: "",
    ConfirmationKey: session.confirmationKey,
    IsSearchWanted: "False",
    IsReCaptchaFailed: "False",
    __RequestVerificationToken: session.requestVerificationToken,
  });

  const res = await fetch(`${INFOFER_BASE}/ro-RO/Stations/StationsResult`, {
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
    throw new UpstreamError(`infofer StationsResult returned ${res.status}`, res.status);
  }

  const html = await res.text();
  const trimmed = html.trim();
  if (trimmed === "ReCaptchaFailed") {
    throw new CaptchaError("infofer StationsResult hit captcha");
  }
  if (trimmed === "ServiceTemporarilyUnavailable") {
    throw new UpstreamError("infofer StationsResult unavailable", 503);
  }

  if (res.status >= 400) {
    throw new UpstreamError(`infofer StationsResult returned ${res.status}`, res.status);
  }

  return html;
}
