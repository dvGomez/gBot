const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { spawnSync } = require('node:child_process')
const yaml = require('js-yaml')

test('release version comes only from a valid explicit tag', (t) => {
  const folder = fs.mkdtempSync(join(tmpdir(), 'gbot-release-test-'))
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }))
  fs.writeFileSync(join(folder, 'package.json'), JSON.stringify({ version: '0.2.0' }))
  fs.writeFileSync(join(folder, 'package-lock.json'), JSON.stringify({ version: '0.2.0', packages: { '': { version: '0.2.0' } } }))
  const script = resolve(__dirname, '../.github/scripts/release-version.cjs')
  for (const tag of ['main', 'v1.2', 'v01.2.3', 'v1.2.3-01']) {
    const result = spawnSync(process.execPath, [script], { cwd: folder, env: { ...process.env, GITHUB_REF_NAME: tag } })
    assert.notEqual(result.status, 0, tag)
  }
  for (const tag of ['v0.3.0', 'v1.2.3-beta.1']) {
    const result = spawnSync(process.execPath, [script], { cwd: folder, env: { ...process.env, GITHUB_REF_NAME: tag } })
    assert.equal(result.status, 0, result.stderr?.toString())
    const pkg = JSON.parse(fs.readFileSync(join(folder, 'package.json')))
    const lock = JSON.parse(fs.readFileSync(join(folder, 'package-lock.json')))
    assert.equal(pkg.version, tag.slice(1))
    assert.equal(lock.packages[''].version, tag.slice(1))
  }
})

test('normal builds cannot publish releases; release workflow only accepts tag pushes', () => {
  const build = yaml.load(fs.readFileSync(resolve(__dirname, '../.github/workflows/build.yml'), 'utf8'))
  const release = yaml.load(fs.readFileSync(resolve(__dirname, '../.github/workflows/release.yml'), 'utf8'))
  assert.deepEqual(build.on.push.branches, ['main'])
  assert.equal(build.on.push.tags, undefined)
  assert(!Object.keys(build.jobs).some((name) => /release|publish/.test(name)))
  assert.deepEqual(Object.keys(release.on), ['push'])
  assert.deepEqual(release.on.push.tags, ['v[0-9]*'])
  assert.equal(release.jobs.publish.steps.at(-1).with.tag_name, '${{ github.ref_name }}')
  assert(release.jobs.build.steps.some((step) => step.run?.includes('--publish never')))
})
