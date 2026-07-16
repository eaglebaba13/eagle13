import { GoldSilverRatioCard } from "../GoldSilverRatioCard";
import { useDashboardData } from "../DashboardDataContext";

export default function GoldSilverWidget() {
  const { data } = useDashboardData();
  return <GoldSilverRatioCard gold={data.gold} silver={data.silver} />;
}