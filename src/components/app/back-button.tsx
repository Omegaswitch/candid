"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/** Back to where the person came from, or to the dashboard when the page was opened directly. */
export function BackButton() {
  const router = useRouter();
  return (
    <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}>
      <ArrowLeft aria-hidden />
      {t.common.back}
    </Button>
  );
}
