import assert from "node:assert/strict";
import { test } from "node:test";

import { convert } from "html-to-text";
import { simpleParser } from "mailparser";

import { HTML_TO_TEXT_SELECTORS, htmlToPlainText, messageText } from "./html-text";

/** Un correo tal como llega por IMAP: líneas con CRLF. */
function eml(...lines: string[]): Buffer {
  return Buffer.from(lines.join("\r\n"), "utf8");
}

const PDF_BASE64 = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n").toString("base64");
const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const FACTURA_HTML = [
  "<html><body>",
  "<h1>Factura 2026-0451</h1>",
  '<p>Hola, adjuntamos su factura. <img src="https://tracker.example/pixel.gif" width="1" height="1"></p>',
  "<table>",
  "<tr><th>Concepto</th><th>Importe</th></tr>",
  "<tr><td>Servicio de mantenimiento</td><td>120,00 EUR</td></tr>",
  "</table>",
  "</body></html>",
].join("\n");

/** El caso real de A-53: solo HTML (sin parte text/plain) y con un PDF adjunto. */
const SOLO_HTML_CON_PDF = eml(
  "From: Proveedor <facturas@proveedor.example>",
  "To: ana@rud1.es",
  "Subject: Su factura",
  "Message-ID: <factura-1@proveedor.example>",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="mix"',
  "",
  "--mix",
  'Content-Type: text/html; charset="utf-8"',
  "Content-Transfer-Encoding: 7bit",
  "",
  FACTURA_HTML,
  "--mix",
  'Content-Type: application/pdf; name="factura.pdf"',
  'Content-Disposition: attachment; filename="factura.pdf"',
  "Content-Transfer-Encoding: base64",
  "",
  PDF_BASE64,
  "--mix--",
  "",
);

/** Solo HTML con el logo incrustado (cid:), como los avisos de bancos y de la Administración. */
const SOLO_HTML_CON_IMAGEN_INCRUSTADA = eml(
  "From: Banco <avisos@banco.example>",
  "To: ana@rud1.es",
  "Subject: Aviso de cargo",
  "Message-ID: <aviso-1@banco.example>",
  "MIME-Version: 1.0",
  'Content-Type: multipart/related; boundary="rel"',
  "",
  "--rel",
  'Content-Type: text/html; charset="utf-8"',
  "",
  '<html><body><img src="cid:logo@banco"><h2>Cargo en su cuenta</h2><p>Se ha cargado un recibo de 45,10 EUR.</p></body></html>',
  "--rel",
  "Content-Type: image/png",
  "Content-ID: <logo@banco>",
  "Content-Transfer-Encoding: base64",
  "",
  PNG_1X1_BASE64,
  "--rel--",
  "",
);

const CON_TEXTO_Y_HTML = eml(
  "From: Luis <luis@x.example>",
  "To: ana@rud1.es",
  "Subject: Hola",
  "Message-ID: <hola-1@x.example>",
  "MIME-Version: 1.0",
  'Content-Type: multipart/alternative; boundary="alt"',
  "",
  "--alt",
  'Content-Type: text/plain; charset="utf-8"',
  "",
  "Este es el texto plano.",
  "--alt",
  'Content-Type: text/html; charset="utf-8"',
  "",
  "<p>Este es el <b>HTML</b>.</p>",
  "--alt--",
  "",
);

test("un correo solo-HTML con un PDF adjunto da texto, no un error 500 (A-53)", async () => {
  const parsed = await simpleParser(SOLO_HTML_CON_PDF);
  // Es justo la situación del fallo: mailparser no saca texto de este correo.
  assert.ok(!parsed.text?.trim(), "el correo de prueba no debe traer texto plano");
  assert.equal(typeof parsed.html, "string");
  assert.equal(parsed.attachments.length, 1);

  const text = messageText(parsed);

  assert.match(text, /Factura 2026-0451/, "el título no se pasa a mayúsculas");
  assert.match(text, /Concepto/);
  assert.match(text, /Importe/);
  assert.match(text, /Servicio de mantenimiento/);
  assert.match(text, /120,00 EUR/);
  assert.ok(!/</.test(text), `no deben quedar etiquetas HTML: ${text}`);
  assert.ok(!/pixel\.gif/.test(text), "las imágenes se saltan");
});

test("un correo solo-HTML con la imagen incrustada (cid:) también", async () => {
  const parsed = await simpleParser(SOLO_HTML_CON_IMAGEN_INCRUSTADA);
  assert.ok(!parsed.text?.trim(), "el correo de prueba no debe traer texto plano");

  const text = messageText(parsed);

  assert.match(text, /Cargo en su cuenta/);
  assert.match(text, /recibo de 45,10 EUR/);
  assert.ok(!/<|logo@banco|data:image/.test(text), `la imagen no debe salir en el texto: ${text}`);
});

test("si el correo trae texto plano se usa tal cual, sin convertir el HTML", async () => {
  const parsed = await simpleParser(CON_TEXTO_Y_HTML);
  assert.equal(messageText(parsed).trim(), "Este es el texto plano.");
});

test("texto vacío o solo espacios: se saca del HTML", () => {
  assert.match(messageText({ text: "  \n ", html: "<p>Hola <b>mundo</b></p>" }), /Hola mundo/);
  assert.match(messageText({ text: undefined, html: "<p>Hola</p>" }), /Hola/);
});

test("sin texto ni HTML el texto es una cadena vacía", () => {
  assert.equal(messageText({}), "");
  assert.equal(messageText({ text: undefined, html: false }), "");
  assert.equal(messageText({ text: "", html: false }), "");
});

test("los selectores no llevan entradas sin formato: con cualquier HTML, convert no lanza", () => {
  for (const html of ["<p>x</p>", FACTURA_HTML, "", "<table><tr><th>a</th></tr></table>"]) {
    assert.doesNotThrow(() => convert(html, { wordwrap: false, selectors: HTML_TO_TEXT_SELECTORS }));
  }
});

test("la causa de A-53: html-to-text lanza si una entrada no trae format y no es un selector suyo", () => {
  // La lista de antes llevaba { selector: "th", options: { uppercase: false } }.
  const antes = [...HTML_TO_TEXT_SELECTORS, { selector: "th", options: { uppercase: false } }];
  assert.throws(
    () => convert("<p>cualquier HTML</p>", { wordwrap: false, selectors: antes }),
    /no specified format/,
  );
});

test("si convert lanza, el mensaje no se cae: se devuelve el texto de respaldo", () => {
  const roto = (() => {
    throw new Error("html imposible");
  }) as unknown as typeof convert;
  const silenciado = console.error;
  console.error = () => {};
  try {
    assert.equal(htmlToPlainText("<p>x</p>", "texto del correo", roto), "texto del correo");
    assert.equal(htmlToPlainText("<p>x</p>", undefined, roto), "");
  } finally {
    console.error = silenciado;
  }
});
