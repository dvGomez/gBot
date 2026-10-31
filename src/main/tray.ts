import { app, Menu, nativeImage, Tray } from 'electron'
import { activeFlowCount } from './flows/scheduler'

/**
 * Ícone na barra de menu: com a janela fechada, o gBot continua rodando (os fluxos agendados disparam)
 * e dá para reabrir ou sair por aqui.
 */

// Silhueta do Brasa (12×12); olhos e boca ficam vazados. Vira "template image": o macOS pinta conforme o tema.
const SPRITE = [
  '.....#......',
  '....##......',
  '....###..#..',
  '...####.##..',
  '..########..',
  '..#########.',
  '.##..##..##.',
  '.##..##..###',
  '############',
  '#####..#####',
  '.##########.',
  '..#######...'
]

function trayIcon() {
  const cell = 3
  const size = 12 * cell // 36 px = 18 pt em tela Retina
  const buf = Buffer.alloc(size * size * 4)
  SPRITE.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch !== '#') return
      for (let y = 0; y < cell; y++)
        for (let x = 0; x < cell; x++) buf.writeUInt32BE(0x000000ff, ((r * cell + y) * size + c * cell + x) * 4)
    })
  )
  const img = nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 2 })
  img.setTemplateImage(true)
  return img
}

let tray: Tray | undefined

export function createTray(openWindow: () => void) {
  tray = new Tray(trayIcon())
  tray.setToolTip('gBot')
  const refresh = () => {
    const n = activeFlowCount()
    tray!.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Abrir gBot', click: openWindow },
        { type: 'separator' },
        { label: n ? `${n} ${n === 1 ? 'fluxo ativo' : 'fluxos ativos'}` : 'Nenhum fluxo ativo', enabled: false },
        { type: 'separator' },
        { label: 'Sair do gBot', role: 'quit' }
      ])
    )
  }
  refresh()
  // Atualiza a contagem de fluxos quando o menu vai abrir (e periodicamente, por garantia).
  tray.on('mouse-enter', refresh)
  setInterval(refresh, 60_000).unref()
  app.on('before-quit', () => tray?.destroy())
}
