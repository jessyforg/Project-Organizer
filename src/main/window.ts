import { app, BrowserWindow, dialog, shell, type Session } from 'electron';
import type { Logger } from './platform/logger';
import { isSafeExternalUrl, isTrustedOrigin } from './security';

/** Denies every permission request (camera, notifications, geolocation, …) until one is needed. */
export function hardenSession(session: Session, csp: string, devServerUrl?: string): void {
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  if (devServerUrl !== undefined) {
    // In production the app:// protocol handler sets the CSP header itself.
    session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] },
      });
    });
  }
}

/** Applies navigation and window-opening rules to every web contents the app creates. */
export function hardenAllWebContents(logger: Logger, devServerUrl?: string): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isTrustedOrigin(url, devServerUrl)) {
        event.preventDefault();
        logger.warn('navigation.blocked');
      }
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      if (isSafeExternalUrl(url)) void shell.openExternal(url);
      else logger.warn('window_open.blocked');
      return { action: 'deny' };
    });
  });
}

export function createMainWindow(preloadPath: string, startUrl: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: app.getName(),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  });
  window.once('ready-to-show', () => window.show());
  guardUnsavedChanges(window);
  void window.loadURL(startUrl);
  return window;
}

/** How long a held close waits for the page to finish saving before trying again. */
const SAVE_GRACE_MS = 1000;

/**
 * The page holds a close (via beforeunload) while a note has unsaved changes and starts saving.
 * The first hold is retried after a short wait, which normally succeeds; if the page still
 * holds it, the save failed and the user decides whether to discard the changes.
 */
function guardUnsavedChanges(window: BrowserWindow): void {
  let held = 0;
  window.webContents.on('will-prevent-unload', () => {
    held += 1;
    if (held === 1) {
      setTimeout(() => {
        if (!window.isDestroyed()) window.close();
      }, SAVE_GRACE_MS);
      return;
    }
    held = 0;
    void dialog
      .showMessageBox(window, {
        type: 'warning',
        title: 'Unsaved changes',
        message: 'A note has changes that could not be saved.',
        detail: 'If you close now, those changes are lost.',
        buttons: ['Keep editing', 'Close without saving'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      .then(({ response }) => {
        if (response === 1 && !window.isDestroyed()) window.destroy();
      });
  });
}
