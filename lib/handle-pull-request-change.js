module.exports = handlePullRequestChange

const isSemanticMessage = require('./is-semantic-message')
const getConfig = require('probot-config')

const DEFAULT_OPTS = {
  validateTitle: false,
  validateCommits: false,
  scopes: null,
  types: null,
  allowMergeCommits: false
}

async function commitsAreSemantic (context, scopes, types, allCommits = false, allowMergeCommits) {
  const commits = await context.github.pullRequests.getCommits(context.repo({
    number: context.payload.pull_request.number
  }))

  return commits.data
    .map(element => element.commit)[allCommits ? 'every' : 'some'](commit => isSemanticMessage(commit.message, scopes, types, allowMergeCommits))
}

async function handlePullRequestChange (context) {
  const { title, head } = context.payload.pull_request
  const {
    validateTitle,
    validateCommits,
    scopes,
    types,
    allowMergeCommits
  } = await getConfig(context, 'semantic.yml', DEFAULT_OPTS)
  const hasSemanticTitle = isSemanticMessage(title, scopes, types)
  const hasSemanticCommits = await commitsAreSemantic(context, scopes, types, validateCommits === 'all', allowMergeCommits)

  let isSemantic

  if (validateTitle && validateCommits) {
    isSemantic = hasSemanticTitle && hasSemanticCommits
  } else if (validateTitle) {
    isSemantic = hasSemanticTitle
  } else if (validateCommits) {
    isSemantic = hasSemanticCommits
  } else {
    isSemantic = hasSemanticTitle || hasSemanticCommits
  }

  const state = isSemantic ? 'success' : 'pending'

  function getDescription () {
    if (validateTitle && validateCommits) return isSemantic ? 'ready to be merged, squashed or rebased' : 'add a semantic commit AND PR title'
    if (hasSemanticTitle && !validateCommits) return 'ready to be squashed'
    if (hasSemanticCommits && !validateTitle) return 'ready to be merged or rebased'
    if (validateTitle) return 'add a semantic PR title'
    if (validateCommits === 'any') return 'add a semantic commit'
    if (validateCommits === 'all') return 'make sure every commit is semantic'
    return 'add a semantic commit or PR title'
  }

  const status = {
    sha: head.sha,
    state,
    target_url: 'https://github.com/probot/semantic-pull-requests',
    description: getDescription(),
    context: 'Semantic Pull Request'
  }
  const result = await context.github.repos.createStatus(context.repo(status))
  return result
}
