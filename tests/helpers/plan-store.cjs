const state = { bots: [], specializations: [], projects: [], flows: [] }
module.exports = {
  state,
  listBots: () => state.bots,
  listSpecializations: () => state.specializations,
  listProjects: () => state.projects,
  listFlows: () => state.flows
}
