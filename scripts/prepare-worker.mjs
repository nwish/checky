import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const databaseName = 'checky-dev'
const configPath = 'wrangler.generated.json'

function runWrangler(args, options = {}) {
  return execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', ...options })
}

function databases() {
  return JSON.parse(runWrangler(['d1', 'list', '--json'], { stdio: ['ignore', 'pipe', 'inherit'] }))
}

let database = databases().find((candidate) => candidate.name === databaseName)
if (!database) {
  console.log(`Creating D1 database '${databaseName}'...`)
  runWrangler(['d1', 'create', databaseName], { stdio: 'inherit' })
  database = databases().find((candidate) => candidate.name === databaseName)
}

if (!database?.uuid) throw new Error(`Unable to find the UUID for D1 database '${databaseName}'`)

const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'))
config.d1_databases = [{
  binding: 'DB',
  database_name: databaseName,
  database_id: database.uuid,
  migrations_dir: 'worker/migrations'
}]
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
console.log(`Wrote ${configPath} for D1 database '${databaseName}'.`)
