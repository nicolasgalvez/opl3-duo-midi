import type { RenderArgs } from './render.ts'

export type RenderJobStatus = 'pending' | 'running' | 'done' | 'failed'

/** One persisted render job, as stored in the queue's lowdb JSON file. */
export interface RenderJob {
  id: number
  /** opl-render positional args (files/folders/playlists). */
  paths: string[]
  /** extractRenderArgs() output, replayed as CLI flags by the queue runner. */
  args: RenderArgs
  label: string
  status: RenderJobStatus
  addedAt: string
  startedAt: string | null
  finishedAt: string | null
  error: string | null
}
