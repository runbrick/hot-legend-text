const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const Store = require('electron-store');

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

const store = new Store({
  name: 'saves',
  defaults: {
    characters: [],
    maxSlots: 3
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

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
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

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // Don't quit on window close for tray support
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});
