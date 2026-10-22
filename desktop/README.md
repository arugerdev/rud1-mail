# rud1 Mail para escritorio

App de escritorio (Windows, macOS y Linux) que abre `https://mail.rud1.es` en
su propia ventana. El correo y la interfaz viven en el servidor: la app solo
añade lo que da un programa instalado.

- Icono propio, menú Inicio / Launchpad / lanzador de Linux.
- Contador de sin leer en la barra de tareas (Windows: punto rojo) y en el Dock.
- Avisos del sistema de correo nuevo; en Windows y Linux sigue en la bandeja
  del sistema al cerrar la ventana (clic derecho → Salir para cerrarla).
- Puede ser la app para los enlaces `mailto:` (bandeja → "Usar para los
  enlaces de correo").
- Abrir al iniciar sesión (Windows), recordando tamaño y posición.
- Corrector ortográfico (español e inglés) y menú del botón derecho.
- Los enlaces de los correos se abren en el navegador, nunca dentro de la app.
- Sin conexión, una pantalla propia que vuelve sola al recuperar la red.

## Desarrollo

```bash
npm install
npm run icons        # tras cambiar ../public/icon.svg
npm test             # reglas de enlaces, contador y mailto
npm run dev          # contra http://localhost:3100 (rud1 Mail en local)
npm start            # contra https://mail.rud1.es
```

## Instaladores

| Sistema | Comando | Resultado (en `release/`) |
|---|---|---|
| Windows | `npm run dist:win` | `rud1-Mail-Setup.exe` (se instala sin pedir administrador) |
| macOS | `npm run dist:mac` (solo en un Mac) | `rud1-Mail-x64.dmg`, `rud1-Mail-arm64.dmg` |
| Linux | `npm run dist:linux` (en Linux) | `rud1-Mail-x86_64.AppImage`, `rud1-mail_<versión>_amd64.deb` |

Los tres a la vez los genera GitHub Actions (`.github/workflows/escritorio.yml`):
a mano desde la pestaña Actions, o publicando una etiqueta `escritorio-vX.Y.Z`.

Para un instalador que apunte a otro servidor (pruebas):
`npx electron-builder --win --config.extraMetadata.rud1MailUrl=https://otra.direccion`.

## Firma

Los instaladores salen **sin firmar**:
- **Windows** muestra "Windows protegió su PC" → *Más información* → *Ejecutar de todas formas*.
- **macOS** no la abre a la primera → *Ajustes del Sistema* → *Privacidad y seguridad* → *Abrir igualmente*.

Para quitar esos avisos hace falta un certificado de firma de código para
Windows y una cuenta de Apple Developer (99 $/año) para firmar y notarizar en Mac.
