import type { Metadata } from "next";
import { TaskView } from "@/components/views/task-view";
import { t } from "@/i18n";

export const generateMetadata = (): Metadata => ({ title: t.views["due-soon"].title });

export default function Page() {
  return <TaskView view="due-soon" />;
}
