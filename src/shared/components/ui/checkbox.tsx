"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  indeterminate?: boolean;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, indeterminate, checked, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);
    React.useEffect(() => {
      if (innerRef.current) innerRef.current.indeterminate = !!indeterminate;
    }, [indeterminate]);

    return (
      <label className="relative inline-flex size-4 cursor-pointer items-center justify-center">
        <input
          ref={innerRef}
          type="checkbox"
          checked={checked}
          className={cn(
            "peer size-4 shrink-0 appearance-none rounded-md border border-border/60 bg-surface-1/40 backdrop-blur-md shadow-glass-xs transition-all checked:border-primary checked:bg-primary checked:shadow-glow-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...props}
        />
        <Check
          className="pointer-events-none absolute size-3 text-primary-foreground opacity-0 peer-checked:opacity-100"
          strokeWidth={3}
        />
      </label>
    );
  }
);
Checkbox.displayName = "Checkbox";
