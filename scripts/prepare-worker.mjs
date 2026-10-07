import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const databaseName = 'rerun'
const configPath = 'wrangler.generated.json'

function runWrangler(args, options = {}) {
  return execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options })
}

function databases() {
  // Wrangler and npm can print banners before JSON output.
  const output = runWrangler(['d1', 'list', '--json'], { stdio: ['ignore', 'pipe', 'inherit'] })
  const start = output.search(/[\[{]/)
  if (start === -1) throw new Error('Wrangler did not return D1 database JSON')
  return JSON.parse(output.slice(start))
}

let database = databases().find((candidate) => candidate.name === databaseName)
if (!database) {
  console.log(`Creating D1 database '${databaseName}'...`)
  runWrangler(['d1', 'create', databaseName], { stdio: 'inherit' })
  database = databases().find((candidate) => candidate.name === databaseName)
}

const databaseId = database?.uuid ?? database?.id
if (!databaseId) throw new Error(`Unable to find the UUID for D1 database '${databaseName}'`)

const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'))
config.d1_databases = [{
  binding: 'DB',
  database_name: databaseName,
  database_id: databaseId,
  migrations_dir: 'worker/migrations'
}]
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
console.log(`Wrote ${configPath} for D1 database '${databaseName}'.`)
