"use client";

import * as React from "react";

/** Al salir de un buzón ajeno, la pestaña (que se abrió desde Administración) se cierra sola. */
export function CloseTab() {
  React.useEffect(() => {
    const timer = window.setTimeout(() => window.close(), 600);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}
