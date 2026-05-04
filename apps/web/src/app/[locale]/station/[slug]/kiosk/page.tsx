import { setRequestLocale, getTranslations } from "next-intl/server";
import type { BoardDirection } from "@peron/types";
import { fetchBoard } from "../../../../../lib/api-board";
import { KioskClient } from "./kiosk-client";

export default async function StationKioskPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const direction: BoardDirection = sp["direction"] === "arrivals" ? "arrivals" : "departures";

  const t = await getTranslations("stationBoard");
  const tHeads = await getTranslations("stationBoard");
  const tKiosk = await getTranslations("kiosk");

  const initial = await fetchBoard(slug, direction).catch(() => null);
  const stationName = initial?.station.name ?? slug.replace(/-/g, " ");

  return (
    <KioskClient
      slug={slug}
      stationName={stationName}
      direction={direction}
      initial={initial}
      labels={{
        departures: t("tabDepartures"),
        arrivals: t("tabArrivals"),
        time: tHeads("headTime"),
        destination: tHeads("headDestination"),
        origin: tHeads("headOrigin"),
        train: tHeads("headTrain"),
        platform: tKiosk("platform"),
        via: tKiosk("via"),
        direct: tKiosk("direct"),
        exit: tKiosk("exit"),
        noEntries: t("noEntries"),
      }}
    />
  );
}

export const metadata = {
  title: "Kiosk · Gara la Gara",
};
