import { setRequestLocale, getTranslations } from "next-intl/server";
import { fetchBoard } from "../../../../lib/api-board";
import { BoardClient } from "./board";

export default async function StationPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("stationBoard");

  const initial = await fetchBoard(slug, "departures").catch(() => null);
  const stationName = initial?.station.name ?? slug.replace(/-/g, " ");

  return (
    <div>
      <BoardClient
        slug={slug}
        stationName={stationName}
        initialDepartures={initial}
        labels={{
          metaDepartures: t("metaDepartures"),
          metaArrivals: t("metaArrivals"),
          tabDepartures: t("tabDepartures"),
          tabArrivals: t("tabArrivals"),
          headTime: t("headTime"),
          headDestination: t("headDestination"),
          headOrigin: t("headOrigin"),
          headTrain: t("headTrain"),
          headDuration: t("headDuration"),
          updatedLabel: t("updatedLabel"),
          annotation: t("annotation"),
          backToSearch: t("backToSearch"),
          noEntries: t("noEntries"),
        }}
      />
    </div>
  );
}
