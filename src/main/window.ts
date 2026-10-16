import { app, BrowserWindow, shell, type Session } from 'electron';
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
  void window.loadURL(startUrl);
  return window;
}
