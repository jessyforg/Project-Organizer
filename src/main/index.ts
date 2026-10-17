import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { app, dialog, ipcMain, Menu, protocol, session } from 'electron';
import { openDatabase, type Db } from './db/connection';
import { migrate } from './db/migrator';
import { appMigrations } from './db/migrations/app';
import { AppError } from './errors';
import { registerIpcHandlers } from './ipc/handler';
import { createFileLogger, type Logger } from './platform/logger';
import { createAppPaths, resolveDataRoot } from './platform/paths';
import { ProfileRegistry } from './profiles/profile-registry';
import { ProfileService } from './profiles/profile-service';
import { createAppProtocolHandler } from './protocol';
import { createProfileServices, runProfileMaintenance } from './services';
import { createChannelImpls } from './ipc/channels';
import { APP_ORIGIN, APP_SCHEME, contentSecurityPolicy, isTrustedOrigin } from './security';
import { createMainWindow, hardenAllWebContents, hardenSession } from './window';

const devServerUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'];
const clock = () => new Date();
const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000;

const paths = createAppPaths(
  resolveDataRoot({
    appDataDir: app.getPath('appData'),
    productName: app.getName(),
    isPackaged: app.isPackaged,
    overrideDir: process.env['PROJECTFORGE_DATA_DIR'],
  }),
);
// Chromium's own storage lives under our data root; the single-instance lock is scoped to it.
app.setPath('userData', paths.electronData);

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
app.enableSandbox();

let mainWindow: BrowserWindow | null = null;
let appDb: Db | null = null;
let profiles: ProfileService | null = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(start, (error: unknown) => fail(null, error));
}

async function start(): Promise<void> {
  const logger = createFileLogger(paths.logs);
  process.on('uncaughtException', (error) => logger.error('process.uncaught_exception', error));
  process.on('unhandledRejection', (error) => logger.error('process.unhandled_rejection', error));
  logger.info('app.starting', { version: app.getVersion(), packaged: app.isPackaged });

  try {
    appDb = openDatabase(paths.appDb);
    await migrate({
      db: appDb,
      migrations: appMigrations,
      snapshotDir: paths.appSnapshots,
      clock,
      logger,
    });
  } catch (error) {
    fail(logger, error);
    return;
  }

  const registry = new ProfileRegistry(appDb);
  const service = new ProfileService({
    registry,
    paths,
    clock,
    newId: randomUUID,
    logger,
    onOpened: (db) => runProfileMaintenance({ db, clock, newId: randomUUID }, logger),
  });
  profiles = service;
  await service.openLastUsed();
  setInterval(() => {
    if (service.getActive() === null) return;
    try {
      runProfileMaintenance({ db: service.activeDb(), clock, newId: randomUUID }, logger);
    } catch (error) {
      logger.error('maintenance.failed', error);
    }
  }, MAINTENANCE_INTERVAL_MS);

  const csp = contentSecurityPolicy(devServerUrl);
  hardenSession(session.defaultSession, csp, devServerUrl);
  hardenAllWebContents(logger, devServerUrl);
  if (devServerUrl === undefined) {
    protocol.handle(APP_SCHEME, createAppProtocolHandler(path.join(__dirname, '../renderer'), csp));
  }
  if (app.isPackaged) Menu.setApplicationMenu(null);

  registerIpcHandlers(
    ipcMain,
    createChannelImpls({
      appInfo: () => ({
        name: app.getName(),
        version: app.getVersion(),
        electronVersion: process.versions.electron,
        dataDirectory: paths.root,
      }),
      profiles: service,
      services: () => createProfileServices({ db: service.activeDb(), clock, newId: randomUUID }),
    }),
    { isTrustedSender: (url) => isTrustedOrigin(url, devServerUrl), logger },
  );

  mainWindow = createMainWindow(
    path.join(__dirname, '../preload/index.js'),
    devServerUrl ?? `${APP_ORIGIN}/index.html`,
  );
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.webContents.on('did-finish-load', () => logger.info('window.loaded'));
  mainWindow.webContents.on('did-fail-load', (_event, errorCode) =>
    logger.warn('window.load_failed', { errorCode }),
  );
  mainWindow.webContents.on('render-process-gone', (_event, details) =>
    logger.warn('renderer.gone', { reason: details.reason }),
  );
  logger.info('app.started');
}

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  profiles?.close();
  appDb?.close();
});

/** Startup failures are shown to the user; data files are never reset or replaced. */
function fail(logger: Logger | null, error: unknown): void {
  logger?.error('app.startup_failed', error);
  const reason = error instanceof AppError ? error.message : 'An unexpected error occurred.';
  dialog.showErrorBox(
    `${app.getName()} could not start`,
    `${reason}\n\nYour data has not been modified. Data folder:\n${paths.root}`,
  );
  app.exit(1);
}
