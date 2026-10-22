import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  screen,
  session,
  shell,
  Tray,
  type MenuItemConstructorOptions,
} from "electron";

import {
  isAppUrl,
  isSafeExternal,
  mailtoFromArgv,
  mailtoRoute,
  resolveAppUrl,
  unreadFromTitle,
} from "./url";
import { Updates } from "./updates";

/**
 * rud1 Mail para escritorio: una ventana que abre mail.rud1.es, con lo que
 * da una app de verdad (icono propio, contador, bandeja del sistema, enlaces
 * mailto:, corrector y menú del botón derecho).
 *
 * El correo vive en el servidor: aquí no se guarda nada salvo el tamaño de la
 * ventana y la sesión (cookie cifrada), igual que en un navegador.
 */

const APP_ID = "es.rud1.mail";
const ASSETS = path.join(__dirname, "..", "assets");
const OFFLINE_FILE = path.join(ASSETS, "offline.html");
/** La única página local que puede abrirse en la ventana. */
const OFFLINE_URL = pathToFileURL(OFFLINE_FILE).href;

function packagedUrl(): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync(path.join(app.getAppPath(), "package.json"), "utf8")) as { rud1MailUrl?: string };
    return pkg.rud1MailUrl;
  } catch {
    return undefined;
  }
}

const APP_ORIGIN = resolveAppUrl(process.env.RUD1_MAIL_URL, packagedUrl());
const isMac = process.platform === "darwin";
const isWindows = process.platform === "win32";

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let trayHintShown = false;
/** mailto: que llegó antes de que la ventana estuviera lista. */
let pendingMailto: string | null = mailtoFromArgv(process.argv);

const updates = new Updates(
  () => win,
  (info) => {
    win?.webContents.send("rud1:updates", info);
    buildMenu();
    rebuildTrayMenu();
  },
  () => {
    quitting = true;
  },
);

// --- Una sola instancia: abrir otra vez la app trae la ventana al frente. ---

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    showWindow();
    const mailto = mailtoFromArgv(argv);
    if (mailto) openCompose(mailto);
  });
}

// En macOS los mailto: llegan por este evento, no por los argumentos.
app.on("open-url", (event, url) => {
  event.preventDefault();
  if (!/^mailto:/i.test(url)) return;
  if (win) openCompose(url);
  else pendingMailto = url;
});

// --- Tamaño y posición de la ventana, recordados entre sesiones. ---

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

const stateFile = () => path.join(app.getPath("userData"), "ventana.json");

function loadWindowState(): WindowState {
  const fallback: WindowState = { width: 1280, height: 820, maximized: false };
  try {
    const saved = JSON.parse(readFileSync(stateFile(), "utf8")) as WindowState;
    if (saved.x === undefined || saved.y === undefined) return { ...fallback, ...saved };
    // Si la pantalla donde estaba ya no existe, se centra en la principal.
    const area = screen.getDisplayMatching({ x: saved.x, y: saved.y, width: saved.width, height: saved.height }).workArea;
    const visible =
      saved.x < area.x + area.width - 100 && saved.x + saved.width > area.x + 100 && saved.y >= area.y - 10 && saved.y < area.y + area.height - 100;
    return visible ? saved : { width: saved.width, height: saved.height, maximized: saved.maximized };
  } catch {
    return fallback;
  }
}

function saveWindowState(window: BrowserWindow): void {
  const bounds = window.getNormalBounds();
  const state: WindowState = { ...bounds, maximized: window.isMaximized() };
  try {
    writeFileSync(stateFile(), JSON.stringify(state));
  } catch {
    // No poder guardar el tamaño no impide nada.
  }
}

// --- Ventana principal. ---

function showWindow(): void {
  if (!win) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function openCompose(mailto: string | null): void {
  showWindow();
  const contents = win?.webContents;
  if (!contents) return;
  // Si la página de la app está cargada, abre el redactor sin recargar; si no
  // (sin conexión, entrada…), se navega a la dirección que lo abre al cargar.
  if (isAppUrl(contents.getURL(), APP_ORIGIN) && !contents.isLoading()) {
    contents.send("rud1:compose", mailto);
  } else {
    void contents.loadURL(mailto ? mailtoRoute(APP_ORIGIN, mailto) : `${APP_ORIGIN}/?redactar=1`);
  }
}

function showOffline(): void {
  void win?.loadFile(OFFLINE_FILE, { query: { url: APP_ORIGIN } });
}

function createWindow(): void {
  const state = loadWindowState();
  win = new BrowserWindow({
    ...state,
    minWidth: 380,
    minHeight: 500,
    show: false,
    title: "rud1 Mail",
    icon: path.join(ASSETS, "icon.png"),
    backgroundColor: "#0a0e17",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  if (state.maximized) win.maximize();
  // Arrancada con el sistema: se queda en la bandeja, sin enseñar la ventana.
  const startHidden = process.argv.includes("--oculta") && tray !== null;
  win.once("ready-to-show", () => {
    if (!startHidden) win?.show();
  });

  const contents = win.webContents;

  // Enlaces que abren ventana nueva (los de los correos): al navegador.
  contents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url, APP_ORIGIN)) void contents.loadURL(url);
    else if (isSafeExternal(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  // Nada que no sea de la app se abre dentro de la ventana.
  contents.on("will-navigate", (event, url) => {
    if (isAppUrl(url, APP_ORIGIN) || url.split("?")[0] === OFFLINE_URL) return;
    event.preventDefault();
    if (isSafeExternal(url)) void shell.openExternal(url);
  });

  // Sin conexión o servidor caído: la página propia, que reintenta sola.
  contents.on("did-fail-load", (_event, code, _desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && isAppUrl(url, APP_ORIGIN)) showOffline();
  });

  // El contador de sin leer viene en el título de la página.
  contents.on("page-title-updated", (_event, title) => updateUnread(unreadFromTitle(title)));

  contents.on("context-menu", (_event, params) => {
    const items: MenuItemConstructorOptions[] = [];
    for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
      items.push({ label: suggestion, click: () => contents.replaceMisspelling(suggestion) });
    }
    if (params.misspelledWord) {
      items.push({
        label: "Añadir al diccionario",
        click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      });
      items.push({ type: "separator" });
    }
    if (params.linkURL && isSafeExternal(params.linkURL) && !isAppUrl(params.linkURL, APP_ORIGIN)) {
      items.push({ label: "Abrir el enlace en el navegador", click: () => void shell.openExternal(params.linkURL) });
      items.push({ label: "Copiar el enlace", click: () => clipboard.writeText(params.linkURL) });
      items.push({ type: "separator" });
    }
    if (params.isEditable) {
      items.push(
        { label: "Cortar", role: "cut", enabled: params.editFlags.canCut },
        { label: "Copiar", role: "copy", enabled: params.editFlags.canCopy },
        { label: "Pegar", role: "paste", enabled: params.editFlags.canPaste },
        { type: "separator" },
        { label: "Seleccionar todo", role: "selectAll" },
      );
    } else if (params.selectionText) {
      items.push({ label: "Copiar", role: "copy" });
    }
    while (items.length > 0 && items[items.length - 1].type === "separator") items.pop();
    if (items.length > 0) Menu.buildFromTemplate(items).popup({ window: win ?? undefined });
  });

  // Cerrar la ventana no cierra la app en Windows y Linux: sigue en la
  // bandeja del sistema para avisar del correo nuevo. En macOS es lo normal.
  win.on("close", (event) => {
    if (win) saveWindowState(win);
    if (quitting || isMac || !tray) return;
    event.preventDefault();
    win?.hide();
    if (!trayHintShown && Notification.isSupported()) {
      trayHintShown = true;
      new Notification({
        title: "rud1 Mail sigue abierta",
        body: "Está en la bandeja del sistema y te avisará del correo nuevo. Para cerrarla del todo: clic derecho en el icono → Salir.",
        icon: path.join(ASSETS, "icon.png"),
      }).show();
    }
  });
  win.on("closed", () => {
    win = null;
  });

  const mailto = pendingMailto;
  pendingMailto = null;
  void win.loadURL(mailto ? mailtoRoute(APP_ORIGIN, mailto) : APP_ORIGIN);
}

// --- Avisos del sistema. ---

/**
 * Los avisos los muestra la app, no la página: los de la página (Notification
 * de HTML) dependen de permisos del navegador y en Windows a veces no salen.
 * Van sin sonido del sistema: la página pone el suyo (elegido por cada uno).
 */
/** Lo último que dijo el sistema al mostrar un aviso (p. ej. "desactivados en Windows"). */
let notificationError: string | null = null;

function showNotification(payload: unknown): void {
  if (!Notification.isSupported() || typeof payload !== "object" || payload === null) return;
  const { title, body, url } = payload as { title?: unknown; body?: unknown; url?: unknown };
  if (typeof title !== "string") return;
  const n = new Notification({
    title: title.slice(0, 200),
    body: typeof body === "string" ? body.slice(0, 500) : "",
    icon: path.join(ASSETS, "icon.png"),
    silent: true,
  });
  n.on("click", () => {
    showWindow();
    // Solo rutas de la propia app ("/?mensaje=…").
    if (typeof url === "string" && url.startsWith("/") && !url.startsWith("//")) {
      win?.webContents.send("rud1:navigate", url);
    }
  });
  n.on("show", () => {
    notificationError = null;
  });
  // Windows los rechaza si el usuario tiene los avisos desactivados (para
  // todo el equipo o para la app): se le dice en Ajustes de rud1 Mail.
  n.on("failed", (_event, error) => {
    notificationError = error;
    win?.webContents.send("rud1:notify-failed", error);
  });
  n.show();
}

function openNotificationSettings(): void {
  if (isWindows) void shell.openExternal("ms-settings:notifications");
  else if (isMac) void shell.openExternal("x-apple.systempreferences:com.apple.preference.notifications");
}

// --- Contador en el icono (barra de tareas, Dock, bandeja). ---

let badgeIcon: Electron.NativeImage | null = null;

function updateUnread(count: number): void {
  if (isWindows && win) {
    badgeIcon ??= nativeImage.createFromPath(path.join(ASSETS, "badge.png"));
    win.setOverlayIcon(count > 0 ? badgeIcon : null, count > 0 ? `${count} sin leer` : "");
  } else {
    app.setBadgeCount(count);
  }
  tray?.setToolTip(count > 0 ? `rud1 Mail · ${count} sin leer` : "rud1 Mail");
}

// --- Bandeja del sistema (Windows y Linux). ---

function updateMenuItems(): MenuItemConstructorOptions[] {
  const info = updates.info();
  const s = info.status;
  const label =
    s.state === "ready"
      ? `Reiniciar y actualizar a ${s.version}`
      : s.state === "downloading"
        ? `Descargando ${s.version}… ${s.percent} %`
        : s.state === "available"
          ? info.canInstall
            ? `Instalar la versión ${s.version}`
            : `Descargar la versión ${s.version}`
          : s.state === "checking"
            ? "Buscando actualizaciones…"
            : "Buscar actualizaciones";
  return [
    { label: `rud1 Mail ${info.version}`, enabled: false },
    {
      label,
      enabled: s.state !== "checking" && s.state !== "downloading",
      click: () => void (s.state === "ready" || s.state === "available" ? updates.installNow() : updates.check()),
    },
    {
      label: "Actualizar automáticamente",
      type: "checkbox",
      checked: info.autoUpdate,
      click: (item) => updates.setAutoUpdate(item.checked),
    },
  ];
}

function createTray(): void {
  if (isMac) return;
  const image = nativeImage.createFromPath(path.join(ASSETS, isWindows ? "tray.ico" : "tray.png"));
  tray = new Tray(image);
  tray.setToolTip("rud1 Mail");
  rebuildTrayMenu();
  tray.on("click", showWindow);
}

function rebuildTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir rud1 Mail", click: showWindow },
      { label: "Redactar", click: () => openCompose(null) },
      { type: "separator" },
      {
        label: "Usar para los enlaces de correo (mailto:)",
        click: () => {
          app.setAsDefaultProtocolClient("mailto");
          // Windows 10/11 pide confirmarlo en su configuración.
          if (isWindows) void shell.openExternal("ms-settings:defaultapps");
        },
      },
      // Linux no tiene un ajuste común de "abrir al iniciar sesión".
      ...(isWindows
        ? [
            {
              label: "Abrir al iniciar sesión",
              type: "checkbox" as const,
              checked: app.getLoginItemSettings().openAtLogin,
              click: (item: Electron.MenuItem) => app.setLoginItemSettings({ openAtLogin: item.checked, args: ["--oculta"] }),
            },
          ]
        : []),
      { type: "separator" },
      ...updateMenuItems(),
      { type: "separator" },
      {
        label: "Salir",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

// --- Menú de la aplicación (en Windows y Linux, oculto hasta pulsar Alt). ---

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    {
      label: "Archivo",
      submenu: [
        { label: "Redactar", accelerator: "CmdOrCtrl+N", click: () => openCompose(null) },
        { type: "separator" },
        isMac ? { role: "close", label: "Cerrar la ventana" } : { label: "Salir", accelerator: "Ctrl+Q", click: () => { quitting = true; app.quit(); } },
      ],
    },
    {
      label: "Editar",
      submenu: [
        { role: "undo", label: "Deshacer" },
        { role: "redo", label: "Rehacer" },
        { type: "separator" },
        { role: "cut", label: "Cortar" },
        { role: "copy", label: "Copiar" },
        { role: "paste", label: "Pegar" },
        { role: "selectAll", label: "Seleccionar todo" },
      ],
    },
    {
      label: "Ver",
      submenu: [
        { role: "reload", label: "Recargar" },
        { type: "separator" },
        { role: "resetZoom", label: "Tamaño normal" },
        { role: "zoomIn", label: "Ampliar" },
        { role: "zoomOut", label: "Reducir" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Pantalla completa" },
      ],
    },
    { role: "windowMenu", label: "Ventana" },
    { label: "Ayuda", submenu: updateMenuItems() },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- Arranque. ---

app.setAppUserModelId(APP_ID);

app.whenReady().then(() => {
  // Permisos: solo avisos (notificaciones) y portapapeles, y solo para la app.
  const allowed = new Set(["notifications", "clipboard-sanitized-write"]);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(allowed.has(permission) && isAppUrl(details.requestingUrl, APP_ORIGIN));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => {
    return allowed.has(permission) && origin === APP_ORIGIN;
  });
  session.defaultSession.setSpellCheckerLanguages(["es-ES", "en-US"]);

  ipcMain.on("rud1:focus", showWindow);
  ipcMain.on("rud1:notify", (event, payload: unknown) => {
    if (isAppUrl(event.senderFrame?.url ?? "", APP_ORIGIN)) showNotification(payload);
  });
  // Ajustes de actualización desde la página (Ajustes → App de escritorio).
  const fromApp = (event: Electron.IpcMainInvokeEvent) => isAppUrl(event.senderFrame?.url ?? "", APP_ORIGIN);
  ipcMain.handle("rud1:notify:status", (event) => (fromApp(event) ? { error: notificationError } : null));
  ipcMain.on("rud1:notify:settings", (event) => {
    if (isAppUrl(event.senderFrame?.url ?? "", APP_ORIGIN)) openNotificationSettings();
  });
  ipcMain.handle("rud1:updates:get", (event) => (fromApp(event) ? updates.info() : null));
  ipcMain.handle("rud1:updates:check", (event) => (fromApp(event) ? updates.check() : null));
  ipcMain.handle("rud1:updates:auto", (event, enabled: unknown) =>
    fromApp(event) && typeof enabled === "boolean" ? updates.setAutoUpdate(enabled) : null,
  );
  ipcMain.handle("rud1:updates:install", async (event) => {
    if (fromApp(event)) await updates.installNow();
    return updates.info();
  });

  buildMenu();
  createTray();
  createWindow();
  updates.start();

  app.on("activate", showWindow);
});

app.on("before-quit", () => {
  quitting = true;
});

app.on("window-all-closed", () => {
  if (!isMac) app.quit();
});
