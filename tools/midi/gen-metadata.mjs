// Generate YouTube metadata JSON for the Top-50 from top50.json.
import { readFileSync, writeFileSync } from 'node:fs'

const songs = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const outPath = process.argv[3] || 'youtube-metadata.json'
const sanitize = (s) => s.replace(/[\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()
const tagHash = (s) => '#' + s.replace(/[^A-Za-z0-9]+/g, '')

const DISCLAIMER =
  'I do not own or hold the copyright to this composition. All rights to the music belong to ' +
  'the original composer(s) and their respective rights holders / game publishers. This is a ' +
  'non-commercial fan rendition created on real FM-synthesis hardware for preservation, education, ' +
  'and appreciation of classic video game music. No copyright infringement is intended. If you are a ' +
  'rights holder and would like this video adjusted or removed, please contact me.'

const HARDWARE =
  'Performed live on a real Yamaha OPL3 (YMF262) FM synthesis chip — an OPL3 Duo board driven by a ' +
  'Teensy microcontroller — the same AdLib / Sound Blaster FM sound that defined classic PC and arcade games.'

const LINKS =
  'OPL3 Duo board (Maarten Janssen / cheerful.nl): https://www.cheerful.nl/opl3-duo\n' +
  'MIDI render project: https://github.com/nicolasgalvez/opl3-duo-midi'

const meta = songs.map((s) => {
  const fileBase = `${String(s.rank).padStart(2, '0')} - ${sanitize(s.game)} - ${sanitize(s.title)}.mp4`
  const title = `${s.title} — ${s.game} (${s.year}) | OPL3 FM Synth (AdLib)`
  const description =
    `${s.title} from ${s.game} (${s.year}), composed by ${s.composer}.\n\n` +
    `${HARDWARE}\n\n` +
    `${LINKS}\n\n` +
    `${DISCLAIMER}\n\n` +
    `#VGM #Teensy #OPL3 #AdLib`
  const tags = [
    '#VGM', '#Teensy', '#OPL3', '#AdLib',
    '#chiptune', '#FMsynthesis', '#videogamemusic', '#retrogaming',
    tagHash(s.game), tagHash(s.title), tagHash(s.composer),
  ]
  return {
    rank: s.rank,
    file: fileBase,
    title,
    song: s.title,
    artist: s.composer,
    game: s.game,
    year: s.year,
    description,
    tags,
    copyright: DISCLAIMER,
  }
})

writeFileSync(outPath, JSON.stringify(meta, null, 2))
console.log(`wrote ${meta.length} entries -> ${outPath}`)
