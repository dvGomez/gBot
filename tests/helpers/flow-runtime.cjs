const state = {
  runs: new Map(),
  bots: new Map(),
  send: async () => {},
  decision: async () => ({ text: '1', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 } }),
  killed: []
}
module.exports = {
  state,
  BrowserWindow: { getAllWindows: () => [] },
  Notification: { isSupported: () => false },
  nativeImage: {},
  getProvider: () => ({ send: (...args) => state.send(...args) }),
  getBot: (id) => state.bots.get(id) ?? ({ id, name: 'Bot de teste', instructions: '' }),
  saveRun: (run) => state.runs.set(run.id, structuredClone(run)),
  listFlows: () => [...new Set([...state.runs.values()].map((run) => run.flowId))].map((id) => ({ id })),
  listRuns: (flowId) => [...state.runs.values()].filter((run) => run.flowId === flowId),
  killSessions: (key) => state.killed.push(key),
  stableUuid: (text) => text,
  askOnce: (...args) => state.decision(...args)
}
