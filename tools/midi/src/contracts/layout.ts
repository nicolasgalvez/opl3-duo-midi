import { z } from 'zod'

// Display layouts the web UI understands. Shared by config validation and the
// --layout CLI flag so the two can never drift apart.
export const LayoutSchema = z.enum(['normal', 'minimized', 'overlay'])
export type Layout = z.infer<typeof LayoutSchema>
