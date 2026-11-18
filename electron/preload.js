'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('slopDesktop', {
  isElectron: true,
  getConfig: () => ipcRenderer.invoke('slop:get-config'),
  setServerUrl: (url) => ipcRenderer.invoke('slop:set-server-url', url),
  signInWithGoogle: (serverUrl) => ipcRenderer.invoke('slop:google-signin', serverUrl),
  clearAuth: () => ipcRenderer.invoke('slop:clear-auth'),
  loadLocalBackup: () => ipcRenderer.invoke('slop:load-local-backup'),
  saveLocalBackup: (data) => ipcRenderer.invoke('slop:save-local-backup', data),
  getSpotifyState: () => ipcRenderer.invoke('slop:spotify-get-state'),
  setSpotifyConfig: (cfg) => ipcRenderer.invoke('slop:spotify-set-config', cfg),
  signInWithSpotify: (opts) => ipcRenderer.invoke('slop:spotify-signin', opts),
  refreshSpotifyToken: () => ipcRenderer.invoke('slop:spotify-refresh'),
  clearSpotifyAuth: () => ipcRenderer.invoke('slop:spotify-clear-auth'),
});
