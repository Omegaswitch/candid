import type { Metadata } from "next";
import { TaskView } from "@/components/views/task-view";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.views["overdue"].title };

export default function Page() {
  return <TaskView view="overdue" />;
}
