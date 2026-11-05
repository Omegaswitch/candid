import { Loader } from "@/components/ui/loader-15";
import { t } from "@/i18n";

export default function Loading() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Loader className="size-24" label={t.common.loading} />
    </div>
  );
}
