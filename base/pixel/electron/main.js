// SG Pixel - janela do Windows (Electron) que abre o editor da pasta app/
const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

let win;
function create() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1000, minHeight: 640,
    backgroundColor: "#0b0b0d", title: "SG Pixel", autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, "preload.js") },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "app", "index.html"));
  win.webContents.on("before-input-event", (e, i) => { if (i.key === "F12") win.webContents.toggleDevTools(); });
}
/* Salvar como: janela do Windows para escolher pasta, nome e formato */
ipcMain.handle("pick-save", async (e, name, onlySgpx) => {
  const filters = onlySgpx ? [{ name: "Projeto SG Pixel", extensions: ["sgpx"] }]
    : [{ name: "Aseprite", extensions: ["aseprite"] }, { name: "Projeto SG Pixel", extensions: ["sgpx"] }];
  const r = await dialog.showSaveDialog(win, { title: "Salvar como", defaultPath: name, filters });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle("read-file", async (e, file) => new Uint8Array(fs.readFileSync(file)));
ipcMain.handle("write-file", async (e, file, data) => { fs.writeFileSync(file, Buffer.from(data)); return true; });
app.whenReady().then(create);
app.on("window-all-closed", () => app.quit());
