import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { app, clipboard, dialog, ipcMain, Menu, protocol, session } from 'electron';
import { BackupService } from './backup/backup-service';
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
import { FileTokens } from './ipc/file-tokens';
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

  // Staging files from an interrupted backup or restore may contain plaintext copies.
  fs.rmSync(paths.tmp, { recursive: true, force: true });

  const registry = new ProfileRegistry(appDb);
  const service = new ProfileService({
    registry,
    paths,
    clock,
    newId: randomUUID,
    logger,
    onOpened: (db, profileId) =>
      runProfileMaintenance({ db, clock, newId: randomUUID }, logger, {
        snapshotDir: paths.profileSnapshots(profileId),
      }),
  });
  profiles = service;
  const purgedProfiles = await service.purgeTrashed();
  if (purgedProfiles > 0) logger.info('profiles.purged', { count: purgedProfiles });
  await service.openLastUsed();
  setInterval(() => {
    const active = service.getActive();
    if (active === null) return;
    try {
      runProfileMaintenance({ db: service.activeDb(), clock, newId: randomUUID }, logger, {
        snapshotDir: paths.profileSnapshots(active.id),
      });
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
      backups: new BackupService({
        paths,
        profiles: service,
        clock,
        newId: randomUUID,
        appVersion: app.getVersion(),
        logger,
      }),
      fileTokens: new FileTokens(),
      dialogs: testDialogs() ?? nativeDialogs,
      clipboard,
      clock,
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

const nativeDialogs = {
  saveFile: async (defaultName: string, filter: { name: string; extension: string }) => {
    const options = {
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters: [{ name: filter.name, extensions: [filter.extension] }],
    };
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options);
    return result.canceled || !result.filePath ? null : result.filePath;
  },
  openFile: async (filter: { name: string; extension: string }) => {
    const options = {
      properties: ['openFile' as const],
      filters: [{ name: filter.name, extensions: [filter.extension] }],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  },
};

/**
 * End-to-end tests cannot click native dialogs. In unpackaged builds only, a test folder
 * can stand in for them: saving writes there, opening picks the newest matching file.
 */
function testDialogs(): typeof nativeDialogs | null {
  const dir = app.isPackaged ? undefined : process.env['PROJECTFORGE_TEST_DIALOG_DIR'];
  if (!dir) return null;
  return {
    saveFile: (defaultName) => Promise.resolve(path.join(dir, defaultName)),
    openFile: (filter) => {
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(`.${filter.extension}`))
        .map((f) => path.join(dir, f))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      return Promise.resolve(files[0] ?? null);
    },
  };
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
