const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, dialog, globalShortcut } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

// Remove default menu bar
Menu.setApplicationMenu(null);

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  return;
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

let mainWindow = null;
let tray = null;
let isQuitting = false;
const HOTKEY_DEFAULT = 'CommandOrControl+Shift+H';

const store = new Store({
  name: 'saves',
  defaults: {
    characters: [],
    maxSlots: 3,
    hotkey: HOTKEY_DEFAULT
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: '热血传奇放置',
    backgroundColor: '#1a0a00',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', async (event) => {
    if (!isQuitting) {
      event.preventDefault();
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        title: '热血传奇放置',
        message: '请选择操作',
        detail: '关闭窗口后游戏仍可在托盘继续挂机',
        buttons: ['最小化到托盘', '退出游戏', '取消'],
        defaultId: 0,
        cancelId: 2,
        noLink: true
      });
      if (response === 0) {
        // Minimize to tray
        mainWindow.hide();
      } else if (response === 1) {
        // Quit
        isQuitting = true;
        mainWindow.webContents.send('before-quit');
        setTimeout(() => {
          app.quit();
        }, 300);
      }
      // response === 2: cancel, do nothing
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // Load the generated tray icon, fallback to empty if not found
  const iconPath = path.join(__dirname, 'renderer', 'icon.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch (e) {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  tray.setToolTip('热血传奇放置 - 挂机中');

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    {
      label: '退出游戏',
      click: () => {
        isQuitting = true;
        mainWindow.webContents.send('before-quit');
        setTimeout(() => {
          app.quit();
        }, 500);
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

// Game data loader (IPC from main process ensures correct paths)
function loadGameDataFromDisk() {
  const fs = require('fs');
  const dataDir = path.join(__dirname, 'renderer', 'game', 'data');
  const result = {};
  const files = {
    'classes': 'classes.json',
    'maps': 'maps.json',
    'monsters': 'monsters.json',
    'equipment': 'equipment.json',
    'skills': 'skills.json',
    'items': 'items.json'
  };
  for (const [key, filename] of Object.entries(files)) {
    try {
      const raw = fs.readFileSync(path.join(dataDir, filename), 'utf-8');
      result[key] = JSON.parse(raw);
    } catch (e) {
      console.error('Failed to load game data:', filename, e.message);
    }
  }
  return result;
}

// IPC handlers
ipcMain.handle('get-game-data', () => {
  return loadGameDataFromDisk();
});

ipcMain.handle('store:get', (event, key) => {
  return store.get(key);
});

ipcMain.handle('store:set', (event, key, value) => {
  store.set(key, value);
  return true;
});

ipcMain.handle('store:getAll', () => {
  return {
    characters: store.get('characters'),
    maxSlots: store.get('maxSlots')
  };
});

ipcMain.handle('save-character', (event, characterData) => {
  const characters = store.get('characters') || [];
  const index = characters.findIndex(c => c.id === characterData.id);
  if (index >= 0) {
    characters[index] = characterData;
  } else {
    if (characters.length >= 3) {
      return { success: false, error: '角色槽位已满（最多3个）' };
    }
    characters.push(characterData);
  }
  store.set('characters', characters);
  return { success: true };
});

ipcMain.handle('delete-character', (event, characterId) => {
  let characters = store.get('characters') || [];
  characters = characters.filter(c => c.id !== characterId);
  store.set('characters', characters);
  return { success: true };
});

function registerMinimizeShortcut(accelerator) {
  globalShortcut.unregisterAll();
  try {
    const ok = globalShortcut.register(accelerator, () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    });
    if (!ok) {
      console.error('Failed to register global shortcut:', accelerator);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Invalid shortcut accelerator:', accelerator, e.message);
    return false;
  }
}

// IPC: get current hotkey
ipcMain.handle('get-hotkey', () => {
  return store.get('hotkey', HOTKEY_DEFAULT);
});

// IPC: set new hotkey
ipcMain.handle('set-hotkey', (event, accelerator) => {
  if (!accelerator || typeof accelerator !== 'string') return { success: false, error: '无效的快捷键' };
  const ok = registerMinimizeShortcut(accelerator);
  if (ok) {
    store.set('hotkey', accelerator);
    return { success: true };
  }
  // Revert to previous on failure
  registerMinimizeShortcut(store.get('hotkey', HOTKEY_DEFAULT));
  return { success: false, error: '快捷键注册失败，可能已被其他应用占用' };
});

// ========== Auto Updater ==========
autoUpdater.autoDownload = false;

autoUpdater.on('checking-for-update', () => {
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'checking' });
});

autoUpdater.on('update-available', (info) => {
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'available',
      version: info.version,
      releaseDate: info.releaseDate
    });
  }
});

autoUpdater.on('update-not-available', () => {
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'up-to-date' });
});

autoUpdater.on('download-progress', (progress) => {
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'downloading',
      percent: Math.floor(progress.percent)
    });
  }
});

autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'downloaded',
      version: info.version
    });
  }
});

autoUpdater.on('error', (err) => {
  console.error('Auto updater error:', err.message);
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'error',
      message: err.message
    });
  }
});

ipcMain.handle('check-update', () => {
  autoUpdater.checkForUpdates().catch(err => {
    console.error('Check for updates failed:', err.message);
  });
});

ipcMain.handle('download-update', () => {
  autoUpdater.downloadUpdate().catch(err => {
    console.error('Download update failed:', err.message);
  });
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerMinimizeShortcut(store.get('hotkey', HOTKEY_DEFAULT));

  // Check for updates 5 seconds after startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 5000);
});

app.on('window-all-closed', () => {
  // Don't quit on window close for tray support
});

app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});
