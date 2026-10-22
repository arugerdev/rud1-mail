"use client";

import * as React from "react";

/**
 * Media query reactiva leída durante el render (sin parpadeo): los menús
 * deciden en el primer pintado si son popover o hoja inferior.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Por debajo del breakpoint `md`: los desplegables se vuelven hoja inferior. */
export function useIsCompactViewport(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
