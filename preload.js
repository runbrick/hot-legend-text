const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Game data (loaded via IPC from main process — reliable path resolution)
  getGameData: () => ipcRenderer.invoke('get-game-data'),

  // Storage
  saveCharacter: (data) => ipcRenderer.invoke('save-character', data),
  deleteCharacter: (id) => ipcRenderer.invoke('delete-character', id),
  getAllCharacters: () => ipcRenderer.invoke('store:getAll'),

  // Quit notification
  onBeforeQuit: (callback) => ipcRenderer.on('before-quit', callback)
});
