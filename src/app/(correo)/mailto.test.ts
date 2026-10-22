import assert from "node:assert/strict";
import { test } from "node:test";

import { parseMailto } from "./mailto";

test("un mailto completo rellena todos los campos", () => {
  assert.deepEqual(
    parseMailto("mailto:ana@x.com?cc=b@y.com&subject=Hola%20Ana&body=L%C3%ADnea%201%0ALinea+2"),
    { to: "ana@x.com", cc: "b@y.com", bcc: "", subject: "Hola Ana", text: "Línea 1\nLinea 2" },
  );
});

test("varios destinatarios y el parámetro to se juntan", () => {
  assert.equal(parseMailto("mailto:a@x.com,b@x.com?to=c@x.com")?.to, "a@x.com,b@x.com, c@x.com");
});

test("lo que no es un mailto se ignora", () => {
  assert.equal(parseMailto("https://www.rud1.es"), null);
  assert.equal(parseMailto("javascript:alert(1)"), null);
});
