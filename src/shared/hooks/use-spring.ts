"use client";

import * as React from "react";

/**
 * Un muelle de verdad, no una curva que lo imite.
 *
 * Integra la ecuación del muelle amortiguado fotograma a fotograma, así que el
 * movimiento arranca, acelera, se pasa un poco y se asienta solo. Devuelve
 * también la velocidad: con ella se pueden deformar las cosas mientras se
 * mueven, que es de donde sale la sensación de peso.
 *
 * Quien haya pedido menos animación en su sistema no ve ninguna: salta al
 * destino. No es un detalle de cortesía, hay gente a la que el movimiento le
 * marea.
 */

export interface OpcionesMuelle {
  /** Rigidez: cuanto más alta, más rápido tira hacia el destino. */
  rigidez?: number;
  /** Amortiguación: cuanto más alta, menos rebota. */
  amortiguacion?: number;
  /** A partir de aquí se considera que ya llegó. */
  precision?: number;
}

export interface EstadoMuelle {
  valor: number;
  velocidad: number;
}

function prefiereMenosMovimiento(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function useSpring(
  destino: number,
  { rigidez = 420, amortiguacion = 32, precision = 0.001 }: OpcionesMuelle = {},
): EstadoMuelle {
  const [estado, setEstado] = React.useState<EstadoMuelle>({
    valor: destino,
    velocidad: 0,
  });
  const fisica = React.useRef({ x: destino, v: 0 });

  React.useEffect(() => {
    if (prefiereMenosMovimiento()) {
      fisica.current = { x: destino, v: 0 };
      setEstado({ valor: destino, velocidad: 0 });
      return;
    }

    let animacion = 0;
    let anterior = performance.now();

    const paso = (ahora: number) => {
      // Tope al salto de tiempo: al volver de otra pestaña el navegador
      // entrega un dt enorme y el muelle saldría disparado.
      const dt = Math.min((ahora - anterior) / 1000, 1 / 30);
      anterior = ahora;

      const s = fisica.current;
      s.v += (-rigidez * (s.x - destino) - amortiguacion * s.v) * dt;
      s.x += s.v * dt;

      if (Math.abs(s.x - destino) < precision && Math.abs(s.v) < precision) {
        const yaEstaba = s.x === destino && s.v === 0;
        s.x = destino;
        s.v = 0;
        // Al montar, el muelle ya está en su sitio: no hay que repintar nada.
        if (!yaEstaba) setEstado({ valor: destino, velocidad: 0 });
        return;
      }
      setEstado({ valor: s.x, velocidad: s.v });
      animacion = requestAnimationFrame(paso);
    };

    animacion = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(animacion);
  }, [destino, rigidez, amortiguacion, precision]);

  return estado;
}
