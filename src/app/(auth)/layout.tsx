import { Logo } from "@/shared/components/logo";
import { ThemeToggle } from "@/shared/components/theme-toggle";
import { THEME_LABELS } from "@/lib/theme-labels";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-gradient-brand">
      <div className="absolute inset-0 bg-grid opacity-30 mask-radial-fade" />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Mail
          </span>
        </div>
        <ThemeToggle labels={THEME_LABELS} />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16 pt-4">{children}</main>
    </div>
  );
}
