// ponte segura entre a pagina e o disco: so escolher onde salvar e gravar o arquivo escolhido
const { contextBridge, ipcRenderer, webUtils } = require("electron");
contextBridge.exposeInMainWorld("sgfs", {
  pickSave: (name, onlySgpx) => ipcRenderer.invoke("pick-save", name, onlySgpx),
  read: (file) => ipcRenderer.invoke("read-file", file),
  write: (file, data) => ipcRenderer.invoke("write-file", file, data),
  pathOf: (file) => { try { return webUtils.getPathForFile(file); } catch (e) { return ""; } },   // caminho do arquivo aberto (para o Salvar gravar nele)
});
