import type { Metadata } from "next";
import { ClientView } from "@/components/clients/client-view";
import { t } from "@/i18n";

export const generateMetadata = (): Metadata => ({ title: t.clients.title });

export default async function ClientPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  // The segment arrives still percent-encoded (it is `encodeURIComponent` of the client name).
  return <ClientView name={safeDecode(name)} />;
}

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}
