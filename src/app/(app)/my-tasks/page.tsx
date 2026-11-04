import type { Metadata } from "next";
import { TaskView } from "@/components/views/task-view";
import { t } from "@/i18n";

export const generateMetadata = (): Metadata => ({ title: t.views["mine"].title });

export default function Page() {
  return <TaskView view="mine" />;
}
