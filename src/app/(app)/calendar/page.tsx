import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar/calendar-view";
import { t } from "@/i18n";

export const generateMetadata = (): Metadata => ({ title: t.calendar.title });

export default function Page() {
  return <CalendarView />;
}
