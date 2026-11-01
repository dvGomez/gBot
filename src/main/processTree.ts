import { execFile, type ChildProcess } from 'node:child_process'

/** Processes on Unix must be spawned detached so their commands share an isolated process group. */
export const processGroup = { detached: process.platform !== 'win32', windowsHide: true }

/** Force-stop the owned process and its commands, without waiting for a cooperative interrupt. */
export function killProcessTree(child: ChildProcess) {
  if (!child.pid) return
  if (process.platform === 'win32') {
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, (error) => {
      if (error && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    })
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
}
