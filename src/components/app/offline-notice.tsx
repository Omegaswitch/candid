"use client";

import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";
import { t } from "@/i18n";

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

/** No offline editing: when the browser is offline we say plainly that changes are not saved. */
export function OfflineNotice() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="flex items-center gap-2 border-b bg-pill-warning px-4 py-2 text-xs text-pill-warning-ink lg:px-6">
      <WifiOff className="size-3.5" aria-hidden />
      {t.common.offline}
    </div>
  );
}
