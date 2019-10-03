module.exports = handlePullRequestChange

const isSemanticMessage = require('./is-semantic-message')
const getConfig = require('probot-config')

const DEFAULT_OPTS = {
  validateTitle: true,
  validateCommits: 'any',
  validationRule: 'or',
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
    validationRule,
    scopes,
    types,
    allowMergeCommits
  } = await getConfig(context, 'semantic.yml', DEFAULT_OPTS)
  const hasSemanticTitle = isSemanticMessage(title, scopes, types)
  const hasSemanticCommits = await commitsAreSemantic(context, scopes, types, validateCommits === 'all', allowMergeCommits)

  let isSemantic

  if (validateTitle && validateCommits) {
    isSemantic = validationRule === 'and' ? (hasSemanticTitle && hasSemanticCommits) : (hasSemanticTitle || hasSemanticCommits)
  } else if (validateTitle) {
    isSemantic = hasSemanticTitle
  } else if (validateCommits) {
    isSemantic = hasSemanticCommits
  } else {
    isSemantic = hasSemanticTitle || hasSemanticCommits
  }

  const state = isSemantic ? 'success' : 'pending'

  function getDescription () {
    description = []
    if (!isSemantic) {
      if (validateCommits === 'any') description.push('add a semantic commit')
      if (validateCommits === 'all') description.push('make sure every commit is semantic')
      if (validateTitle) description.push('add a semantic PR title')
      return description.join(' ' + validationRule + ' ')
    }
    if (hasSemanticTitle && validateTitle) description.push('squashed')
    if (hasSemanticCommits && validateCommits) description.push('merged or rebased')
    return 'ready to be ' + description.join(', ')
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
