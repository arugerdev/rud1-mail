import assert from "node:assert/strict";
import { test } from "node:test";

import {
  forwardSubject,
  isValidEmail,
  linkify,
  parseAddressList,
  quoteForReply,
  replySubject,
  textToHtml,
} from "./text";

test("el asunto de respuesta no acumula prefijos", () => {
  assert.equal(replySubject("Presupuesto"), "Re: Presupuesto");
  assert.equal(replySubject("Re: RE: Presupuesto"), "Re: Presupuesto");
  assert.equal(replySubject("RV: Fwd: Presupuesto"), "Re: Presupuesto");
  assert.equal(forwardSubject("Re: Presupuesto"), "Fwd: Presupuesto");
});

test("las listas de direcciones aceptan nombre, comas y punto y coma", () => {
  assert.deepEqual(parseAddressList('Ana <ana@x.com>, b@y.com; "Luis Pérez" <luis@z.es>'), [
    { name: "Ana", address: "ana@x.com" },
    { address: "b@y.com" },
    { name: "Luis Pérez", address: "luis@z.es" },
  ]);
  assert.deepEqual(parseAddressList("  "), []);
});

test("solo pasan direcciones con forma de correo", () => {
  assert.ok(isValidEmail("aruger@rud1.es"));
  assert.ok(!isValidEmail("aruger@rud1"));
  assert.ok(!isValidEmail("aruger rud1.es"));
  assert.ok(!isValidEmail("<a@b.com>"));
});

test("la cita de respuesta marca cada línea con >", () => {
  const quote = quoteForReply({
    from: { name: "Ana", address: "ana@x.com" },
    to: [],
    date: "2026-10-22T10:00:00Z",
    subject: "Hola",
    text: "línea 1\n> ya citada",
  });
  assert.match(quote, /Ana <ana@x.com> escribió:/);
  assert.match(quote, /\n> línea 1\n>> ya citada/);
});

test("el HTML generado escapa el texto y convierte enlaces y citas", () => {
  const html = textToHtml('Hola <b>\nVer https://www.rud1.es.\n> citado');
  assert.ok(html.includes("Hola &lt;b&gt;"));
  assert.ok(html.includes('<a href="https://www.rud1.es"'));
  assert.ok(html.includes("<blockquote"));
  assert.ok(!html.includes("<b>"));
});

test("los enlaces no se tragan la puntuación final", () => {
  assert.equal(
    linkify("mira https://a.com/x."),
    'mira <a href="https://a.com/x" target="_blank" rel="noopener noreferrer">https://a.com/x</a>.',
  );
});
