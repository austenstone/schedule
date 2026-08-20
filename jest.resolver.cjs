// @actions/* and their octokit deps are ESM-only (exports has no `require` condition),
// so jest's CJS resolver can't see them. Resolve just those with the `import` condition
// and let transformIgnorePatterns hand them to ts-jest for CJS transformation.
// Scoped deliberately: applying `import` globally makes jest resolve its own internals as ESM.
const ESM_ONLY = /^(@actions\/|@octokit\/|universal-user-agent|before-after-hook)/;

module.exports = (request, options) =>
  options.defaultResolver(
    request,
    ESM_ONLY.test(request) ? { ...options, conditions: ['node', 'import'] } : options
  );
