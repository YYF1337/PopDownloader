const { app, BrowserWindow } = require('electron')
const path = require('path')
const http = require('http')

// 直接在主进程内拉起 Express 后端（server/index.js 会调用 app.listen 并保持进程存活）
require(path.join(__dirname, '..', 'server', 'index.js'))

const PORT = process.env.PORT || 3001
const BASE = `http://localhost:${PORT}`

let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.on('closed', () => {
    win = null
  })
  waitForServerThenLoad()
}

// 后端 listen 是异步的，先轮询就绪再 loadURL，避免白屏
function waitForServerThenLoad() {
  const tryLoad = (attempt) => {
    const req = http.get(BASE, (res) => {
      res.destroy()
      win.loadURL(BASE)
    })
    req.on('error', () => {
      if (attempt < 30) {
        setTimeout(() => tryLoad(attempt + 1), 300)
      } else {
        win.loadURL(BASE)
      }
    })
  }
  tryLoad(0)
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
