"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { useSpring } from "@/shared/hooks/use-spring";

/** Tarjeta centrada de las pantallas sin sesión; el icono entra con un muelle. */
export function AuthCard({
  icon,
  title,
  subtitle,
  tone = "primary",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  tone?: "primary" | "success" | "warning";
  children?: React.ReactNode;
}) {
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => setShown(true), []);
  const { valor } = useSpring(shown ? 1 : 0, { rigidez: 260, amortiguacion: 14 });

  return (
    <Card className="w-full max-w-md shadow-glass-lg">
      <CardHeader className="items-center space-y-3 text-center">
        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-2xl border border-border/50 shadow-glass-sm",
            tone === "primary" && "bg-primary-soft/50 text-primary-foreground dark:text-primary",
            tone === "success" && "bg-success-soft/50 text-success-foreground dark:text-success",
            tone === "warning" && "bg-warning-soft/50 text-warning-foreground dark:text-warning",
          )}
          style={{ transform: `scale(${0.6 + valor * 0.4})`, opacity: Math.min(1, valor * 1.5) }}
        >
          {icon}
        </div>
        <div className="space-y-1">
          <CardTitle className="text-xl">{title}</CardTitle>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </CardHeader>
      {children && <CardContent className="space-y-4">{children}</CardContent>}
    </Card>
  );
}
