import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isAppUrl,
  isSafeExternal,
  mailtoFromArgv,
  mailtoRoute,
  resolveAppUrl,
  unreadFromTitle,
} from "./url";

test("la dirección por defecto es mail.rud1.es y solo se acepta https o localhost", () => {
  assert.equal(resolveAppUrl(undefined, undefined), "https://mail.rud1.es");
  assert.equal(resolveAppUrl("http://localhost:3100/", undefined), "http://localhost:3100");
  assert.equal(resolveAppUrl(undefined, "https://mail.rud1.es/algo"), "https://mail.rud1.es");
  assert.throws(() => resolveAppUrl("http://mail.rud1.es", undefined));
});

test("solo las páginas de la app se quedan dentro", () => {
  assert.ok(isAppUrl("https://mail.rud1.es/?carpeta=Sent", "https://mail.rud1.es"));
  assert.ok(!isAppUrl("https://mail.rud1.es.evil.com/", "https://mail.rud1.es"));
  assert.ok(!isAppUrl("https://www.rud1.es/", "https://mail.rud1.es"));
  assert.ok(!isAppUrl("no es una url", "https://mail.rud1.es"));
});

test("al navegador del sistema solo va la web normal", () => {
  assert.ok(isSafeExternal("https://www.rud1.es"));
  assert.ok(isSafeExternal("http://example.com"));
  assert.ok(!isSafeExternal("file:///C:/Windows/System32/calc.exe"));
  assert.ok(!isSafeExternal("javascript:alert(1)"));
  assert.ok(!isSafeExternal("ms-msdt:/id"));
});

test("el contador sale del título de la página", () => {
  assert.equal(unreadFromTitle("(12) Bandeja de entrada · rud1 Mail"), 12);
  assert.equal(unreadFromTitle("Bandeja de entrada · rud1 Mail"), 0);
});

test("los enlaces mailto: llegan por los argumentos", () => {
  assert.equal(mailtoFromArgv(["rud1 Mail.exe", "--flag", "mailto:ana@x.com?subject=Hola"]), "mailto:ana@x.com?subject=Hola");
  assert.equal(mailtoFromArgv(["rud1 Mail.exe"]), null);
  assert.equal(
    mailtoRoute("https://mail.rud1.es", "mailto:ana@x.com"),
    "https://mail.rud1.es/?mailto=mailto%3Aana%40x.com",
  );
});
