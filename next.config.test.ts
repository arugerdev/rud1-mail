import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// path-to-regexp es el que usa Next para leer el `source` de las cabeceras; se
// carga su copia para probar el patrón tal como lo interpreta Next.
const { pathToRegexp } = require("next/dist/compiled/path-to-regexp") as { pathToRegexp: (source: string) => RegExp };

type Rule = { source: string; headers: { key: string; value: string }[] };

async function rules(): Promise<Rule[]> {
  const { default: nextConfig } = await import("./next.config.mjs");
  return (await nextConfig.headers!()) as Rule[];
}

/** Las cabeceras que Next pondría a `path`: las de todas las reglas que lo casan. */
async function headersFor(path: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const rule of await rules()) {
    if (!pathToRegexp(rule.source).test(path)) continue;
    for (const h of rule.headers) out.set(h.key.toLowerCase(), h.value);
  }
  return out;
}

/** Rutas que ponen su propia CSP (A-42). */
const CON_CSP_PROPIA = [
  "/api/imagen/GX-vDfpkAr2v_M1Mv1xNO_VEUL1b3_sH/aHR0cDovL3RyYWNrZXIubGFiLnRlc3Q6ODA4MC9ldmlsLnN2Zw",
  "/api/imagen/firma-invalida/x",
  "/api/adjunto",
  "/api/archivos/ckx9a1b2c0001",
  "/api/archivos/subir",
  "/f/token-del-enlace/d/ckx9a1b2c0001",
];

/** Páginas y rutas de la aplicación: llevan la CSP global. */
const CON_CSP_GLOBAL = [
  "/",
  "/entrar",
  "/acceder/abc",
  "/cambiar-contrasena",
  "/archivos",
  "/ajustes/archivos",
  "/api/salud",
  "/api/estado",
  "/api/avatar",
  "/api/eventos",
  "/api/imagenes-no-es-la-ruta",
  // La página del enlace compartido es HTML de la aplicación: solo su descarga
  // (/f/<token>/d/<id>) trae CSP propia.
  "/f/token-del-enlace",
  "/f/token-del-enlace/dx",
  "/_next/static/chunks/main.js",
];

test("las rutas que traen su propia CSP no reciben la global, que las sustituía (A-42)", async () => {
  for (const path of CON_CSP_PROPIA) {
    const h = await headersFor(path);
    assert.equal(
      h.get("content-security-policy"),
      undefined,
      `${path}: la CSP global (script-src 'unsafe-inline') pisaría la de la ruta`,
    );
  }
});

test("el resto de rutas siguen con la CSP global", async () => {
  for (const path of CON_CSP_GLOBAL) {
    const csp = (await headersFor(path)).get("content-security-policy");
    assert.ok(csp, `${path}: debe llevar CSP`);
    assert.match(csp, /default-src 'self'/, path);
    assert.match(csp, /script-src 'self' 'unsafe-inline' 'unsafe-eval'/, path);
    assert.match(csp, /frame-ancestors 'self'/, path);
    assert.match(csp, /object-src 'none'/, path);
  }
});

test("todas las rutas, también las que traen su CSP, siguen con las demás cabeceras de seguridad", async () => {
  for (const path of [...CON_CSP_PROPIA, ...CON_CSP_GLOBAL]) {
    const h = await headersFor(path);
    assert.equal(h.get("x-content-type-options"), "nosniff", path);
    assert.equal(h.get("x-frame-options"), "SAMEORIGIN", path);
    assert.equal(h.get("referrer-policy"), "no-referrer", path);
    assert.match(h.get("permissions-policy") ?? "", /camera=\(\)/, path);
  }
});

test("quien se excluye de la CSP global la pone él: si no, se quedaría sin ninguna", () => {
  // Cada ruta de CON_CSP_PROPIA tiene que declarar una CSP en su código.
  const raiz = process.cwd();
  const poneCsp = (fichero: string) => /content-security-policy/i.test(readFileSync(join(raiz, fichero), "utf8"));
  assert.ok(poneCsp("src/app/api/imagen/[firma]/[url]/route.ts"), "/api/imagen");
  assert.ok(poneCsp("src/app/api/adjunto/route.ts"), "/api/adjunto");
  // /api/archivos/[id] y /f/[token]/d/[id] responden con fileResponse().
  assert.ok(poneCsp("src/lib/file-response.ts"), "/api/archivos y /f/<token>/d");
  assert.match(readFileSync(join(raiz, "src/app/api/archivos/[id]/route.ts"), "utf8"), /fileResponse\(/);
  assert.match(readFileSync(join(raiz, "src/app/(auth)/f/[token]/d/[id]/route.ts"), "utf8"), /fileResponse\(/);
});

test("la CSP de /api/imagen cierra scripts: sandbox y default-src 'none'", () => {
  const fuente = readFileSync(join(process.cwd(), "src/app/api/imagen/[firma]/[url]/route.ts"), "utf8");
  const csp = fuente.match(/"content-security-policy":\s*"([^"]+)"/i)?.[1] ?? "";
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /\bsandbox\b/);
  assert.ok(!/script-src/.test(csp), "no debe permitir scripts");
});
