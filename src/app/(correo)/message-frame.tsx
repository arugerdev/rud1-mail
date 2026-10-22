"use client";

import * as React from "react";

/**
 * Marco donde se pinta el mensaje.
 *
 * `sandbox` sin `allow-scripts`: el HTML del correo no puede ejecutar nada.
 * `allow-same-origin` solo sirve para que esta página mida la altura del
 * contenido; sin scripts dentro, no da ningún poder al mensaje. Los enlaces
 * se abren en una pestaña nueva, fuera del marco.
 */
export function MessageFrame({ document, title }: { document: string; title: string }) {
  const ref = React.useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = React.useState(240);

  React.useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let observer: ResizeObserver | null = null;

    const measure = () => {
      const doc = frame.contentDocument;
      if (!doc?.documentElement) return;
      // El borde del marco también ocupa: sin sumarlo sale una barra de 2 px.
      const border = frame.offsetHeight - frame.clientHeight;
      setHeight(Math.max(120, Math.ceil(doc.documentElement.scrollHeight) + border));
    };
    const onLoad = () => {
      measure();
      const doc = frame.contentDocument;
      if (doc?.documentElement) {
        observer?.disconnect();
        observer = new ResizeObserver(measure);
        observer.observe(doc.documentElement);
        // Las imágenes cambian la altura al terminar de cargar.
        doc.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure));
      }
    };

    frame.addEventListener("load", onLoad);
    // Un srcdoc corto puede terminar de cargar antes de que llegue este efecto.
    if (frame.contentDocument?.readyState === "complete") onLoad();
    return () => {
      frame.removeEventListener("load", onLoad);
      observer?.disconnect();
    };
  }, [document]);

  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={document}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      className="block w-full rounded-xl border border-border/40 bg-white"
      style={{ height }}
    />
  );
}
