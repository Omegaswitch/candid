import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6">
      <SettingsNav />
      <div>{children}</div>
    </div>
  );
}
