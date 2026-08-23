const { app, BrowserWindow, shell, dialog, Menu } = require("electron");
const fs = require("fs");
const path = require("path");

const INDEX_HTML = path.join(__dirname, "..", "www", "index.html");

function createWindow() {
  if (!fs.existsSync(INDEX_HTML)) {
    dialog.showErrorBox(
      "Petko",
      "Web fajlovi nisu pronađeni u www/. Pokreni npm run build, pa ponovo startuj aplikaciju."
    );
    app.quit();
    return;
  }

  const win = new BrowserWindow({
    width: 540,
    height: 900,
    minWidth: 400,
    minHeight: 640,
    backgroundColor: "#0f172a",
    title: "Петко",
    icon: path.join(__dirname, "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile(INDEX_HTML);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    const isLocal = url.startsWith("file:");
    if (!isLocal) {
      event.preventDefault();
      if (url.startsWith("http:") || url.startsWith("https:")) {
        shell.openExternal(url);
      }
    }
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});
