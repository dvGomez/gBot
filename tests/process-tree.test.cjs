const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { createJiti } = require('jiti')
const { killProcessTree, processGroup } = createJiti(__filename)('../src/main/processTree.ts')

test('encerra o processo e o comando filho que ele iniciou', { timeout: 10000 }, async (t) => {
  const source = `
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' });
    console.log(child.pid);
    setInterval(() => {}, 1000);
  `
  const parent = spawn(process.execPath, ['-e', source], { ...processGroup, stdio: ['ignore', 'pipe', 'pipe'] })
  let childPid
  t.after(() => {
    if (parent.exitCode === null && parent.signalCode === null) killProcessTree(parent)
    if (childPid) { try { process.kill(childPid, 'SIGKILL') } catch {} }
  })
  const [output] = await once(parent.stdout, 'data')
  childPid = Number(output.toString().trim())
  assert(childPid > 0)
  const exited = once(parent, 'exit')
  killProcessTree(parent)
  await exited
  const alive = () => { try { process.kill(childPid, 0); return true } catch { return false } }
  for (let i = 0; alive() && i < 50; i++) await new Promise((r) => setTimeout(r, 50))
  assert.equal(alive(), false, 'o comando filho não pode continuar rodando')
  childPid = undefined
})
