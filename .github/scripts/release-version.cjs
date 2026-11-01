const fs = require('node:fs')

// Only an explicit version tag can choose a release version. No commits or tags are made by CI.
const tag = process.env.GITHUB_REF_NAME ?? ''
const semver = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
if (!semver.test(tag)) throw new Error(`Expected an explicit version tag such as v0.3.0; received ${JSON.stringify(tag)}`)
const version = tag.slice(1)
for (const file of ['package.json', 'package-lock.json']) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'))
  json.version = version
  if (json.packages?.['']) json.packages[''].version = version
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`)
}
console.log(`Building gBot ${version} from ${tag}`)
