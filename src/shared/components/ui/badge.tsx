import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-primary/30 bg-primary-soft/40 text-primary-foreground dark:text-primary",
        secondary:
          "border-border/60 bg-surface-1/50 text-secondary-foreground backdrop-blur-md",
        destructive:
          "border-destructive/40 bg-destructive-soft/50 text-destructive-foreground dark:text-destructive",
        success:
          "border-success/40 bg-success-soft/50 text-success-foreground dark:text-success",
        warning:
          "border-warning/40 bg-warning-soft/50 text-warning-foreground dark:text-warning",
        outline: "border-border/60 bg-surface-1/30 text-foreground backdrop-blur-sm",
        solid:
          "border-transparent bg-primary text-primary-foreground shadow-glass-xs",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
