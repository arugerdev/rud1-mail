import assert from "node:assert/strict";
import { test } from "node:test";

import { BODY_NEEDS_HTML, bodyOf, parseParts, partsChanged, resolvePart, type PartDefaults } from "./parts";

const defaults: PartDefaults = {
  header: { include: false, html: "<p>Cabecera</p>" },
  signature: { include: true, html: "<p>Firma</p>" },
  footer: { include: true, html: "<p>Pie</p>" },
};

test("sin elegir nada, cada parte sale como siempre", () => {
  assert.equal(resolvePart(defaults.signature), "<p>Firma</p>");
  assert.equal(resolvePart(defaults.header), null);
});

test("se puede quitar una parte o ponerla aunque por defecto no vaya", () => {
  assert.equal(resolvePart(defaults.footer, { include: false, html: null }), null);
  assert.equal(resolvePart(defaults.header, { include: true, html: null }), "<p>Cabecera</p>");
});

test("una versión solo para este mensaje sustituye a la de siempre", () => {
  assert.equal(resolvePart(defaults.signature, { include: true, html: "<p>Otra</p>" }), "<p>Otra</p>");
  // Quitada, aunque tenga versión propia, no sale.
  assert.equal(resolvePart(defaults.signature, { include: false, html: "<p>Otra</p>" }), null);
});

test("lo que manda el redactor se valida y lo raro se ignora", () => {
  assert.deepEqual(parseParts(""), {});
  assert.deepEqual(parseParts("no es json"), {});
  assert.deepEqual(parseParts("[1,2]"), {});
  assert.deepEqual(
    parseParts(JSON.stringify({ footer: { include: false }, signature: { include: true, html: "<b>x</b>" }, otra: { include: true }, header: { include: "sí" } })),
    { footer: { include: false, html: null }, signature: { include: true, html: "<b>x</b>" } },
  );
  assert.deepEqual(parseParts({ header: { include: true, html: "x".repeat(400_000) } }), { header: { include: true, html: null } });
});

test("se marca como cambiado solo lo que difiere de lo de siempre", () => {
  assert.equal(partsChanged(defaults, {}), false);
  assert.equal(partsChanged(defaults, { signature: { include: true, html: null } }), false);
  assert.equal(partsChanged(defaults, { footer: { include: false, html: null } }), true);
  assert.equal(partsChanged(defaults, { header: { include: false, html: "<p>x</p>" } }), true);
});

test("un diseño con tablas se edita en HTML; el texto con formato, en el visual", () => {
  assert.ok(BODY_NEEDS_HTML.test('<table role="presentation"><tr><td>Hola</td></tr></table>'));
  assert.ok(!BODY_NEEDS_HTML.test("<p>Hola <strong>Ana</strong></p><img src=\"data:image/png;base64,AAAA\">"));
});

test("de un documento entero solo cuenta el body", () => {
  assert.equal(bodyOf("<!doctype html><html><head><title>T</title></head><body style=\"margin:0\"><p>Hola</p></body></html>"), "<p>Hola</p>");
  assert.equal(bodyOf("<p>Solo un trozo</p>"), "<p>Solo un trozo</p>");
});
