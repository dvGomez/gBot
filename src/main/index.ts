import { join } from 'node:path'
import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import { startScheduler } from './flows/scheduler'
import { registerIpc } from './ipc'
import { createTray } from './tray'

// Garante a mesma pasta de dados (~/Library/Application Support/gBot) em dev e no app instalado.
app.setName('gBot')

const BG = '#141414'

/** Abre a janela, ou mostra a que já existe. */
function openWindow() {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'gBot',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 20 },
    backgroundColor: BG,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  win.once('ready-to-show', () => win.show())

  // Links externos abrem no navegador padrão, nunca dentro do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  // O gBot só tem tema escuro: menus e diálogos nativos acompanham.
  nativeTheme.themeSource = 'dark'
  // No app instalado o ícone vem do pacote; em dev, o Dock mostraria o ícone do Electron.
  if (!app.isPackaged) app.dock?.setIcon(join(app.getAppPath(), 'build/icon.png'))
  registerIpc()
  createWindow()
  createTray(openWindow)
  startScheduler()
  app.on('activate', openWindow)
})

// Fechar a janela não encerra o app: ele segue na barra de menu para os fluxos agendados.
// Para sair de vez: "Sair do gBot" no ícone da barra de menu (ou Cmd+Q).
app.on('window-all-closed', () => undefined)
