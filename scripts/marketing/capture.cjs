// Fotografa páginas HTML em PNG (2x). Chamado por make-marketing.mts: electron capture.cjs <jobs.json>
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')

app.dock?.hide()
// Sem isto o app fecharia ao destruir a primeira janela.
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  const jobs = JSON.parse(fs.readFileSync(process.argv.at(-1), 'utf8'))
  for (const job of jobs) {
    const win = new BrowserWindow({ width: job.width, height: job.height, show: false, useContentSize: true, frame: false })
    await win.loadFile(job.html)
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 300)))')
    let img = await win.webContents.capturePage()
    if (img.getSize().width !== job.width * 2) img = img.resize({ width: job.width * 2, quality: 'best' })
    fs.writeFileSync(job.out, img.toPNG())
    console.log('ok', job.out.split('/').slice(-2).join('/'), img.getSize())
    win.destroy()
  }
  app.quit()
})
