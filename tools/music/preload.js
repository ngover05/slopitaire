'use strict';
// Job channel between the renderer page (render.js) and the tool's main process (main.js)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  ready: () => ipcRenderer.send('ready'),
  onJob: (fn) => ipcRenderer.on('job', (_e, id, kind, payload) => fn(id, kind, payload)),
  done: (id, result) => ipcRenderer.send('done', id, result),
  fail: (id, message) => ipcRenderer.send('fail', id, message),
});
