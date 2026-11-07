import test from "node:test";
import assert from "node:assert/strict";

import { copiasABorrar, esNombreDeCopia, ipPermitida, leerConfig, secretoCoincide } from "./copias-bd-reglas";

const SECRETO = "s".repeat(40);

test("solo se aceptan nombres de copia", () => {
  assert.equal(esNombreDeCopia("rud1-20261107-0330.zip"), true);
  for (const malo of ["rud1-20261107-0330.dump", "../rud1-20261107-0330.zip", "rud1-2026117-0330.zip", "otra.zip", "rud1-20261107-0330.zip.exe", ""]) {
    assert.equal(esNombreDeCopia(malo), false, malo);
  }
});

test("sin secreto largo o sin destino, la entrada no existe", () => {
  assert.equal(leerConfig({}), null);
  assert.equal(leerConfig({ COPIAS_BD_SECRETO: "corto", COPIAS_BD_DESTINO: "a@rud1.es" }), null);
  assert.equal(leerConfig({ COPIAS_BD_SECRETO: SECRETO }), null);
  assert.equal(leerConfig({ COPIAS_BD_SECRETO: SECRETO, COPIAS_BD_DESTINO: "no-es-un-correo" }), null);
});

test("configuración por defecto: «Backups BD» y 14 copias", () => {
  const c = leerConfig({ COPIAS_BD_SECRETO: SECRETO, COPIAS_BD_DESTINO: " Aruger@rud1.es ", COPIAS_BD_IPS: "85.215.134.204, 1.2.3.4" });
  assert.deepEqual(c, { secreto: SECRETO, destino: "aruger@rud1.es", ips: ["85.215.134.204", "1.2.3.4"], carpeta: "Backups BD", guardar: 14 });
  assert.equal(leerConfig({ COPIAS_BD_SECRETO: SECRETO, COPIAS_BD_DESTINO: "a@rud1.es", COPIAS_BD_GUARDAR: "0" })?.guardar, 14);
  assert.equal(leerConfig({ COPIAS_BD_SECRETO: SECRETO, COPIAS_BD_DESTINO: "a@rud1.es", COPIAS_BD_GUARDAR: "9999" })?.guardar, 365);
});

test("el secreto se compara entero", () => {
  assert.equal(secretoCoincide(SECRETO, SECRETO), true);
  assert.equal(secretoCoincide(SECRETO + "x", SECRETO), false);
  assert.equal(secretoCoincide(SECRETO.slice(1), SECRETO), false);
  assert.equal(secretoCoincide("", SECRETO), false);
  assert.equal(secretoCoincide(null, SECRETO), false);
});

test("la IP: lista vacía deja pasar; con lista, solo esas", () => {
  assert.equal(ipPermitida("9.9.9.9", []), true);
  assert.equal(ipPermitida("85.215.134.204", ["85.215.134.204"]), true);
  assert.equal(ipPermitida("9.9.9.9", ["85.215.134.204"]), false);
  assert.equal(ipPermitida(undefined, ["85.215.134.204"]), false);
});

test("se borran las copias más antiguas y nada más de la carpeta", () => {
  const f = (name: string, kind: "file" | "folder" = "file") => ({ id: name, name, kind });
  const hijos = [
    f("rud1-20261101-0330.zip"),
    f("rud1-20261103-0330.zip"),
    f("rud1-20261102-0330.zip"),
    f("rud1-20261104-0330.zip"),
    f("mis-notas.txt"),
    f("rud1-20261001-0330.zip", "folder"),
  ];
  assert.deepEqual(copiasABorrar(hijos, 2), ["rud1-20261102-0330.zip", "rud1-20261101-0330.zip"]);
  assert.deepEqual(copiasABorrar(hijos, 14), []);
});
