// mt32-pi's raw UDP MIDI receiver (and other wifi-MIDI targets) listen here by
// convention: https://github.com/dwhinham/mt32-pi/wiki/Networking%3A-UDP-MIDI
export const DEFAULT_MIDI_UDP_PORT = 1999

/** A resolved network MIDI destination (vs. the USB default). */
export interface NetTarget {
  host: string
  port: number
}
