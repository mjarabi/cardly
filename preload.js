const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (text) => ipcRenderer.invoke('data:save', text),
  saveMedia: (bytes, ext) => ipcRenderer.invoke('media:save', bytes, ext),
  pickImport: () => ipcRenderer.invoke('import:pick'),
  exportText: (opts) => ipcRenderer.invoke('export:text', opts),
  pickBackup: () => ipcRenderer.invoke('backup:pick'),
  setTheme: (mode, color) => ipcRenderer.invoke('theme:set', mode, color),
  appInfo: () => ipcRenderer.invoke('app:info'),
  openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),
  listPacks: () => ipcRenderer.invoke('packs:list'),
  libraryInfo: () => ipcRenderer.invoke('library:info'),
  libraryLoad: () => ipcRenderer.invoke('library:load'),
  aiChat: (req) => ipcRenderer.invoke('ai:chat', req),
  ttsStatus: () => ipcRenderer.invoke('tts:status'),
  ttsSynth: (req) => ipcRenderer.invoke('tts:synth', req),
  ttsOpenFolder: () => ipcRenderer.invoke('tts:openFolder'),
  ankiScan: () => ipcRenderer.invoke('anki:scan'),
  ankiPickCollection: () => ipcRenderer.invoke('anki:pickCollection'),
  ankiRead: (req) => ipcRenderer.invoke('anki:read', req),
  ankiReadPackage: (req) => ipcRenderer.invoke('anki:readPackage', req),
  ankiCopyMedia: (req) => ipcRenderer.invoke('anki:copyMedia', req),
  onAnkiProgress: (fn) => {
    ipcRenderer.removeAllListeners('anki:progress');
    ipcRenderer.on('anki:progress', (_e, text) => fn(String(text)));
  }
});
