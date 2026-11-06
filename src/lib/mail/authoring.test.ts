// Se ejecuta con --conditions=react-server: así "server-only" no protesta fuera de Next.
import assert from "node:assert/strict";
import { test } from "node:test";

import { sanitizeAuthoredHtml } from "./authoring";

test("un documento entero se queda en su body, sin título ni estilos sueltos", () => {
  const out = sanitizeAuthoredHtml(
    "<!doctype html><html><head><title>Campaña</title><style>p{color:red}</style></head><body><p>Hola</p></body></html>",
  );
  assert.equal(out, "<p>Hola</p>");
});

test("los diseños de correo con tablas conservan colores, fondos y esquinas", () => {
  const out = sanitizeAuthoredHtml(
    '<table role="presentation" width="600" bgcolor="#eceff4" align="center" style="background:#eceff4"><tr>' +
      '<td bgcolor="#161e31" style="background:#161e31;background-image:linear-gradient(135deg,#3d99f5 0%,#51caf6 100%);border-radius:20px;box-shadow:0 10px 30px rgba(22,30,49,0.10);overflow:hidden">' +
      '<p style="text-transform:uppercase;letter-spacing:0.09em;color:#74bcfb">Antes</p></td></tr></table>',
  );
  assert.match(out, /<table[^>]*bgcolor="#eceff4"/);
  assert.match(out, /align="center"/);
  assert.match(out, /background:#161e31/);
  assert.match(out, /linear-gradient\(135deg,#3d99f5 0%,#51caf6 100%\)/);
  assert.match(out, /box-shadow:0 10px 30px rgba\(22,30,49,0\.10\)/);
  assert.match(out, /text-transform:uppercase/);
  assert.match(out, /overflow:hidden/);
});

test("el pre-encabezado oculto se mantiene oculto", () => {
  const out = sanitizeAuthoredHtml('<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">Resumen</div>');
  assert.match(out, /display:none/);
  assert.match(out, /max-height:0/);
  assert.match(out, /opacity:0/);
});

test("nada que cargue de fuera ni que ejecute código", () => {
  const out = sanitizeAuthoredHtml(
    '<td style="background:url(https://espia.example/p.gif);background-image:url(data:image/png;base64,AAAA)">x</td>' +
      '<script>alert(1)</script><a href="javascript:alert(1)" onclick="x()">enlace</a><img src="http://inseguro.example/a.png">',
  );
  assert.doesNotMatch(out, /url\(/);
  assert.doesNotMatch(out, /script|alert|onclick|javascript:/);
  assert.doesNotMatch(out, /http:\/\/inseguro/);
});

test("las imágenes pegadas (data:) y los enlaces mailto siguen valiendo", () => {
  const out = sanitizeAuthoredHtml(
    '<img src="data:image/jpeg;base64,AAAA" alt="Equipo" width="190" border="0"><a href="mailto:sales@rud1.es?subject=Hola">Pedir información</a>',
  );
  assert.match(out, /src="data:image\/jpeg;base64,AAAA"/);
  assert.match(out, /border="0"/);
  assert.match(out, /href="mailto:sales@rud1\.es\?subject=Hola"/);
});
