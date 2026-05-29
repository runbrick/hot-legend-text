const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Game data (loaded via IPC from main process — reliable path resolution)
  getGameData: () => ipcRenderer.invoke('get-game-data'),

  // Storage
  saveCharacter: (data) => ipcRenderer.invoke('save-character', data),
  deleteCharacter: (id) => ipcRenderer.invoke('delete-character', id),
  getAllCharacters: () => ipcRenderer.invoke('store:getAll'),

  // Hotkey
  getHotkey: () => ipcRenderer.invoke('get-hotkey'),
  setHotkey: (accelerator) => ipcRenderer.invoke('set-hotkey', accelerator),

  // Quit notification
  onBeforeQuit: (callback) => ipcRenderer.on('before-quit', callback),

  // Auto updater
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, data) => callback(data));
  }
});
