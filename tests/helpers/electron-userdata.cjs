// Electron mínimo para testar o que só precisa de app.getPath('userData').
let userData = ''
module.exports = {
  setUserData: (dir) => { userData = dir },
  app: { getPath: () => userData }
}
