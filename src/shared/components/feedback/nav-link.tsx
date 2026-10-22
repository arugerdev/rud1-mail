"use client";

import * as React from "react";
import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";

// Passthrough wrappers to next/link + next/navigation.

export interface NavLinkProps
  extends LinkProps,
    Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> {
  children?: React.ReactNode;
}

export function NavLink(props: NavLinkProps) {
  return <Link {...props} />;
}

export function useNavRouter() {
  const router = useRouter();
  return React.useMemo(
    () => ({
      push: router.push,
      replace: router.replace,
      back: router.back,
      refresh: router.refresh,
      raw: router,
    }),
    [router],
  );
}
