import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')
const nativeRoot = path.join(projectRoot, 'src', 'native')
const tauriBin = path.join(projectRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')

// The refactor keeps all source under src/, so every native command runs from
// the dedicated native crate under src/native.
const child = spawn(process.execPath, [tauriBin, ...process.argv.slice(2)], {
  cwd: nativeRoot,
  env: process.env,
  stdio: 'inherit',
  windowsHide: false,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
