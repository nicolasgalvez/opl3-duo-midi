import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const toolDir = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Boot opl serve for layout-specific browser tests. */
export async function startTestServer(layout, port) {
  const args = ['opl.mjs', 'serve', './tests/fixtures', '--http', String(port)]
  if (layout) args.push('--layout', layout)
  const proc = spawn('node', args, { cwd: toolDir, stdio: 'pipe' })
  // Tolerant of CI cold starts (native module init can take a few seconds).
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`)
      if (res.ok) return proc
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  proc.kill()
  throw new Error(`Server on port ${port} failed to start (layout=${layout || 'normal'})`)
}

export function stopTestServer(proc) {
  if (proc && !proc.killed) proc.kill('SIGTERM')
}
