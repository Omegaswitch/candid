import type { Metadata } from "next";
import { AnalyticsView } from "@/components/analytics/analytics-view";
import { t } from "@/i18n";

export const generateMetadata = (): Metadata => ({ title: t.analytics.title });

export default function AnalyticsPage() {
  return <AnalyticsView />;
}
