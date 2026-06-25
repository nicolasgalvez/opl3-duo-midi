import { WorkletSynthesizer, Sequencer } from 'spessasynth_lib'
import { BasicSoundBank } from 'spessasynth_core'
import workletUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url'
import { makeChannel, channelLevel, type ChannelState } from './eq'
import { rms } from './audioLevel'

const CH = 16

/**
 * In-browser SoundFont playback (ODM-5). Wraps spessasynth's WebAudio worklet
 * synthesizer + sequencer so the player makes sound without the hardware OPL3.
 * Ships with spessasynth_core's built-in sample SoundFont as the default, and
 * accepts user `.sf2` banks. Feeds the 16-channel equalizer from the synth's
 * note events, and exposes a master RMS level for metering/tests.
 */
export class SoundfontPlayer {
  private ctx: AudioContext | null = null
  private synth: WorkletSynthesizer | null = null
  private seq: Sequencer | null = null
  private analyser: AnalyserNode | null = null
  private buf = new Float32Array(0)
  private channels: ChannelState[] = Array.from({ length: CH }, makeChannel)
  private loadPromise: Promise<void> = Promise.resolve()
  loadedName = 'default (built-in)'

  get ready(): boolean {
    return this.synth !== null
  }

  async init(): Promise<void> {
    if (this.synth) return
    const ctx = new AudioContext()
    await ctx.audioWorklet.addModule(workletUrl)
    const synth = new WorkletSynthesizer(ctx, { eventsEnabled: true })

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    synth.connect(analyser)
    analyser.connect(ctx.destination)
    this.buf = new Float32Array(analyser.fftSize)

    // Default SoundFont — built into spessasynth_core, so it works out of the box.
    await synth.soundBankManager.addSoundBank(BasicSoundBank.getSampleSoundBankFile(), 'main')
    await synth.isReady

    synth.eventHandler.addEvent('noteOn', 'eq', (d) => this.channels[d.channel]?.notes.set(d.midiNote, d.velocity))
    synth.eventHandler.addEvent('noteOff', 'eq', (d) => this.channels[d.channel]?.notes.delete(d.midiNote))
    synth.eventHandler.addEvent('controllerChange', 'eq', (d) => {
      const c = this.channels[d.channel]
      if (!c) return
      if (d.controller === 7) c.vol = d.value / 127
      else if (d.controller === 11) c.exp = d.value / 127
      else if (d.controller === 120 || d.controller === 123) c.notes.clear()
    })

    this.ctx = ctx
    this.synth = synth
    this.analyser = analyser
    this.seq = new Sequencer(synth, { skipToFirstNoteOn: true })
  }

  /** Replace the active SoundFont with a user-supplied `.sf2` bank. */
  async loadSoundFont(buffer: ArrayBuffer, name: string): Promise<void> {
    await this.init()
    await this.synth!.soundBankManager.addSoundBank(buffer, 'main')
    await this.synth!.isReady
    this.loadedName = name
  }

  async loadMidi(buffer: ArrayBuffer): Promise<void> {
    await this.init()
    this.resetChannels()
    this.seq!.loadNewSongList([{ binary: buffer }])
  }

  /** Fetch a MIDI file and load it; play() awaits this so there's no race. */
  loadMidiFromUrl(url: string): Promise<void> {
    this.loadPromise = (async () => {
      await this.init()
      const res = await fetch(url)
      if (!res.ok) return
      await this.loadMidi(await res.arrayBuffer())
    })()
    return this.loadPromise
  }

  async play(): Promise<void> {
    await this.init()
    await this.loadPromise // wait for any in-flight track load
    await this.ctx!.resume()
    this.seq!.play()
  }

  pause(): void {
    this.seq?.pause()
  }

  /** Master RMS amplitude of the current output (0 ≈ silent). */
  level(): number {
    if (!this.analyser) return 0
    this.analyser.getFloatTimeDomainData(this.buf)
    return rms(this.buf)
  }

  /** Per-channel 0..1 levels for the 16-channel equalizer. */
  channelLevels(): number[] {
    return this.channels.map((c) => channelLevel(c))
  }

  resetChannels(): void {
    this.channels.forEach((c) => {
      c.notes.clear()
      c.vol = 1
      c.exp = 1
    })
  }

  destroy(): void {
    this.synth?.destroy()
    void this.ctx?.close()
    this.ctx = null
    this.synth = null
    this.seq = null
    this.analyser = null
  }
}

// Single shared instance — one AudioContext per page.
export const soundfontPlayer = new SoundfontPlayer()
