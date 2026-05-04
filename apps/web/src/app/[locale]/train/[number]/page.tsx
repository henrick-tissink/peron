import { setRequestLocale } from "next-intl/server";
import { fetchTrain } from "../../../../lib/api-train";
import { TrainTimeline } from "./timeline";

export default async function TrainPage({
  params,
}: {
  params: Promise<{ locale: string; number: string }>;
}) {
  const { locale, number } = await params;
  setRequestLocale(locale);

  const initial = await fetchTrain(number).catch(() => null);

  return <TrainTimeline number={number} initial={initial} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  return {
    title: `Tren ${number} · Gara la Gara`,
  };
}
