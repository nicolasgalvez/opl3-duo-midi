import { z } from 'zod'

// JSPF (JSON XSPF — https://www.xspf.org/jspf) envelope. Deliberately tolerant
// beyond this shape: per-track validation stays lenient in the parser so a
// playlist with a few malformed entries still yields its good tracks.
export const JspfSchema = z
  .object({
    playlist: z
      .object({
        track: z.array(z.unknown()),
      })
      .passthrough(),
  })
  .passthrough()

export type Jspf = z.infer<typeof JspfSchema>
