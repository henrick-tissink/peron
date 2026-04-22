/**
 * Capture golden HTML fixtures from real CFR.
 * Run: pnpm --filter @peron/api exec tsx scripts/capture-fixtures.ts
 * Rerun quarterly or when parser tests fail against live CFR.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../test/fixtures");
const BASE = "https://bilete.cfrcalatori.ro";

// Use +7 days — CFR only allows searches within 30-day window
const target = new Date();
target.setDate(target.getDate() + 7);
const dd = String(target.getDate()).padStart(2, "0");
const mm = String(target.getMonth() + 1).padStart(2, "0");
const yyyy = target.getFullYear();
const formDate = `${dd}.${mm}.${yyyy} 00:00:00`;

type Pair = { from: string; to: string; file: string };
const PAIRS: Pair[] = [
  { from: "Bucuresti-Nord", to: "Brasov",             file: "direct-bucuresti-brasov.html" },
  { from: "Bucuresti-Nord", to: "Sibiu",              file: "with-transfer-bucuresti-sibiu.html" },
  { from: "Bucuresti-Nord", to: "Cluj-Napoca",        file: "sleeper-bucuresti-cluj.html" },
  { from: "Timisoara-Nord", to: "Budapesta-Keleti",   file: "international-timisoara-budapest.html" },
  { from: "Halmeu",         to: "Carei",              file: "no-results-remote-pair.html" },
];

async function bootstrap(from: string, to: string) {
  const url = `${BASE}/ro-RO/Rute-trenuri/${from}/${to}`;
  const res = await fetch(url);
  const html = await res.text();
  // Collect all Set-Cookie values
  const cookies: string[] = [];
  res.headers.forEach((val, key) => {
    if (key.toLowerCase() === "set-cookie") {
      cookies.push(val.split(";")[0]!.trim());
    }
  });
  const cookie = cookies.join("; ");
  const tokenMatch = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  const keyMatch = html.match(/name="ConfirmationKey"[^>]*value="([^"]+)"/);
  if (!tokenMatch || !keyMatch) throw new Error(`bootstrap failed for ${from}→${to}: tokens not found`);
  return { html, cookie, token: tokenMatch[1]!, confirmationKey: keyMatch[1]! };
}

async function search(pair: Pair) {
  const { html: bootHtml, cookie, token, confirmationKey } = await bootstrap(pair.from, pair.to);
  await writeFile(resolve(OUT, "bootstrap-rute-trenuri.html"), bootHtml);

  // Send the full form as the browser does — all hidden fields are required
  const body = new URLSearchParams({
    ArrivalStationName: pair.to.replace(/-/g, " "),
    ArrivalTrainRunningNumber: "",
    ChangeStationName: "",
    ConnectionsTypeId: "1",
    DepartureDate: formDate,
    DepartureStationName: pair.from.replace(/-/g, " "),
    DepartureTrainRunningNumber: "",
    MinutesInDay: "0",
    OrderingTypeId: "0",
    TimeSelectionId: "0",
    ReCaptcha: "",
    ConfirmationKey: confirmationKey,
    IsBikesServiceRequired: "False",
    IsOnlineBuyingRequired: "False",
    IsBarRestaurantServiceRequired: "False",
    IsSleeperCouchetteServiceRequired: "False",
    BetweenTrainsMinimumMinutes: "15",
    PrmRequestStringId: "",
    IsSearchWanted: "False",
    IsReCaptchaFailed: "False",
    __RequestVerificationToken: token,
  });

  const res = await fetch(`${BASE}/ro-RO/Itineraries/GetItineraries`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "cookie": cookie,
      "x-requested-with": "XMLHttpRequest",
    },
    body,
  });
  const html = await res.text();
  await writeFile(resolve(OUT, pair.file), html);
  console.log(`✓ ${pair.file} (${html.length} bytes)`);
}

async function stationsLanding() {
  const res = await fetch(`${BASE}/ro-RO`);
  const html = await res.text();
  await writeFile(resolve(OUT, "stations-landing.html"), html);
  console.log(`✓ stations-landing.html (${html.length} bytes)`);
}

async function captchaStub() {
  await writeFile(resolve(OUT, "captcha-response.txt"), "ReCaptchaFailed");
  console.log("✓ captcha-response.txt (synthetic)");
}

async function priceSnippetStub() {
  const stub = `<span class="price">41,5 lei</span>`;
  await writeFile(resolve(OUT, "price-snippet.html"), stub);
  console.log("✓ price-snippet.html (synthetic stub)");
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await stationsLanding();
  for (const pair of PAIRS) {
    try {
      await search(pair);
    } catch (err) {
      console.warn(`⚠ ${pair.file} failed: ${(err as Error).message} — writing synthetic stub`);
      await writeFile(resolve(OUT, pair.file), "<html><body><ul id=\"itineraries-list\"></ul></body></html>");
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  await captchaStub();
  await priceSnippetStub();
  console.log("\nAll fixtures captured.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
