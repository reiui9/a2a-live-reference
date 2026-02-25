import { spawn } from 'node:child_process'
import { setTimeout as wait } from 'node:timers/promises'

const server = spawn('node', ['src/server.mjs'], { stdio: 'inherit' })
await wait(700)

const client = spawn('node', ['examples/initiator.mjs'], { stdio: 'inherit' })

const exitCode = await new Promise((resolve) => {
  client.on('exit', resolve)
})

server.kill('SIGTERM')
if (exitCode !== 0) process.exit(exitCode)
