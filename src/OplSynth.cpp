#include "OplSynth.h"

// These headers DEFINE the GM bank arrays (not just declare), so they may be
// included in exactly ONE translation unit. Keep them here, never in main.cpp.
#include <midi_instruments_4op.h>   // midiInstruments[]
#include <midi_drums.h>             // midiDrums[]

namespace {
  constexpr float   PI2 = 6.28318f;

  constexpr uint8_t CONTROL_BANK_MSB      = 0;
  constexpr uint8_t CONTROL_MODULATION    = 1;
  constexpr uint8_t CONTROL_VOLUME        = 7;
  constexpr uint8_t CONTROL_PAN           = 10;
  constexpr uint8_t CONTROL_EXPRESSION    = 11;
  constexpr uint8_t CONTROL_BANK_LSB      = 32;
  constexpr uint8_t CONTROL_SUSTAIN       = 64;
  constexpr uint8_t CONTROL_ALL_SOUND_OFF = 120;
  constexpr uint8_t CONTROL_RESET_ALL     = 121;
  constexpr uint8_t CONTROL_ALL_NOTES_OFF = 123;

  // Note F-numbers per octave, +/- 2 semitones of headroom for pitch bend.
  const unsigned int notePitches[16] = {
    0x132, 0x144,
    0x156, 0x16B, 0x181, 0x198, 0x1B0, 0x1CA,
    0x1E5, 0x202, 0x220, 0x241, 0x263, 0x287,
    0x2AC, 0x2D6
  };

  // OPL channels reserved for drums (2-op slots not used by the 4-op voices).
  const uint8_t drumChannelsOPL[12] = {
     6,  7,  8, 15, 16, 17,
    24, 25, 26, 33, 34, 35
  };
}  // namespace

OplSynth::OplSynth()
    : _opl3(cfg::OPL3_A2, cfg::OPL3_A1, cfg::OPL3_A0, cfg::OPL3_LATCH, cfg::OPL3_RESET) {}

void OplSynth::begin() {
  systemReset();
}

// Modulation / aftertouch LFO. Cheap when no channel is modulating.
void OplSynth::update() {
  for (uint8_t i = 0; i < NUM_MELODIC_CHANNELS; i++) {
    uint8_t midiChannel = _melodic[i].midiChannel;
    float modulation = max(_midi[midiChannel].modulation, _midi[midiChannel].afterTouch);
    if (modulation > 0.0f) {
      float tModulation = (millis() - _midi[midiChannel].tAfterTouch) * (PI2 / 200);
      uint8_t controlChannel = _opl3.get4OPControlChannel(i);
      uint8_t baseNote = (_melodic[i].note % 12) + 2;
      float fModulation = (notePitches[baseNote + 1] - notePitches[baseNote]) * modulation;
      float fDelta = (1.0f - ((cos(tModulation) * 0.5f) + 0.5f)) * fModulation;
      _opl3.setFNumber(controlChannel, notePitches[baseNote] + fDelta);
    }
  }

  // L/R VU levels for the LEDs, stepped at a fixed ~5ms rate so the envelope
  // timing is independent of how fast loop() spins.
  uint32_t now = millis();
  if (now - _lastVuMs >= 5) {
    _lastVuMs = now;
    float tL = 0.0f, tR = 0.0f;
    for (uint8_t i = 0; i < NUM_MELODIC_CHANNELS; i++) {
      if (_melodic[i].note == VALUE_UNDEFINED) continue;
      uint8_t mc = _melodic[i].midiChannel;
      float lvl = _melodic[i].noteVelocity * _midi[mc].volume * _midi[mc].expression;
      if (_midi[mc].panLeft)  tL += lvl;
      if (_midi[mc].panRight) tR += lvl;
    }
    for (uint8_t i = 0; i < NUM_DRUM_CHANNELS; i++) {
      if (_drums[i].note == VALUE_UNDEFINED) continue;
      tL += _drums[i].noteVelocity;   // drums sit center
      tR += _drums[i].noteVelocity;
    }
    if (tL > 1.0f) tL = 1.0f;
    if (tR > 1.0f) tR = 1.0f;
    _vuL += (tL - _vuL) * (tL > _vuL ? 0.5f : 0.08f);   // fast attack, slower decay
    _vuR += (tR - _vuR) * (tR > _vuR ? 0.5f : 0.08f);
  }
}

void OplSynth::playMelodic(uint8_t midiChannel, uint8_t note, uint8_t velocity) {
  midiChannel = midiChannel % NUM_MIDI_CHANNELS;

  uint8_t program = _midi[midiChannel].program;
  uint8_t oplChannelIndex = VALUE_UNDEFINED;

  // Prefer the oldest free voice already holding this program (>= 2 free so we
  // don't clobber the release tail of an older note of the same patch).
  unsigned long oldest = -1;
  uint8_t sameProgramCount = 0;
  for (uint8_t i = 0; i < NUM_MELODIC_CHANNELS; i++) {
    if (_melodic[i].program == program && _melodic[i].note == VALUE_UNDEFINED) {
      sameProgramCount++;
      if (_melodic[i].eventIndex < oldest) {
        oldest = _melodic[i].eventIndex;
        oplChannelIndex = i;
      }
    }
  }

  // Otherwise any free voice.
  if (oplChannelIndex == VALUE_UNDEFINED || sameProgramCount < 2) {
    oldest = -1;
    for (uint8_t i = 0; i < NUM_MELODIC_CHANNELS; i++) {
      if (_melodic[i].note == VALUE_UNDEFINED && _melodic[i].eventIndex < oldest) {
        oldest = _melodic[i].eventIndex;
        oplChannelIndex = i;
      }
    }
  }

  // No free voice: recycle the oldest one with the same program.
  if (oplChannelIndex == VALUE_UNDEFINED) {
    oldest = -1;
    for (uint8_t i = 0; i < NUM_MELODIC_CHANNELS; i++) {
      if (_melodic[i].program == program && _melodic[i].eventIndex < oldest) {
        oldest = _melodic[i].eventIndex;
        oplChannelIndex = i;
      }
    }
  }

  // Still nothing: recycle the outright oldest.
  if (oplChannelIndex == VALUE_UNDEFINED) {
    oldest = -1;
    for (uint8_t i = 0; i < NUM_MELODIC_CHANNELS; i++) {
      if (_melodic[i].eventIndex < oldest) {
        oldest = _melodic[i].eventIndex;
        oplChannelIndex = i;
      }
    }
  }

  if (oplChannelIndex != VALUE_UNDEFINED) {
    _opl3.setKeyOn(_opl3.get4OPControlChannel(oplChannelIndex), false);

    _eventIndex++;
    _melodic[oplChannelIndex].eventIndex = _eventIndex;
    _melodic[oplChannelIndex].midiChannel = midiChannel;
    _melodic[oplChannelIndex].note = note;
    _melodic[oplChannelIndex].sustained = false;
    _melodic[oplChannelIndex].noteVelocity = log(min((float)velocity, 127.0)) / log(127.0);

    // Only reload instrument registers when the patch on this voice changed.
    if (_melodic[oplChannelIndex].program != program) {
      _melodic[oplChannelIndex].program = program;
      _opl3.setFNumber(_opl3.get4OPControlChannel(oplChannelIndex), 0);
      _opl3.setInstrument4OP(oplChannelIndex, _midi[midiChannel].instrument, 0.0);
    }
    setOplChannelVolume(oplChannelIndex, midiChannel);
    applyPanning(oplChannelIndex, midiChannel);

    note = max(24, min(note, 119));
    uint8_t octave = 1 + (note - 24) / 12;
    note = note % 12;
    _opl3.playNote(_opl3.get4OPControlChannel(oplChannelIndex), octave, note);
  }
}

void OplSynth::playDrum(uint8_t note, uint8_t velocity) {
  uint8_t program;
  if (note >= DRUM_NOTE_BASE && note < DRUM_NOTE_BASE + NUM_MIDI_DRUMS) {
    program = note - DRUM_NOTE_BASE;
  } else {
    return;
  }

  uint8_t oplChannelIndex = VALUE_UNDEFINED;
  unsigned long oldest = -1;

  for (uint8_t i = 0; i < NUM_DRUM_CHANNELS; i++) {
    if (_drums[i].program == program && _drums[i].note == VALUE_UNDEFINED && _drums[i].eventIndex < oldest) {
      oldest = _drums[i].eventIndex;
      oplChannelIndex = i;
    }
  }

  if (oplChannelIndex == VALUE_UNDEFINED) {
    oldest = -1;
    for (uint8_t i = 0; i < NUM_DRUM_CHANNELS; i++) {
      if (_drums[i].note == VALUE_UNDEFINED && _drums[i].eventIndex < oldest) {
        oldest = _drums[i].eventIndex;
        oplChannelIndex = i;
      }
    }
  }

  if (oplChannelIndex == VALUE_UNDEFINED) {
    oldest = -1;
    for (uint8_t i = 0; i < NUM_DRUM_CHANNELS; i++) {
      if (_drums[i].program == program && _drums[i].eventIndex < oldest) {
        oldest = _drums[i].eventIndex;
        oplChannelIndex = i;
      }
    }
  }

  if (oplChannelIndex == VALUE_UNDEFINED) {
    oldest = -1;
    for (uint8_t i = 0; i < NUM_DRUM_CHANNELS; i++) {
      if (_drums[i].eventIndex < oldest) {
        oldest = _drums[i].eventIndex;
        oplChannelIndex = i;
      }
    }
  }

  if (oplChannelIndex != VALUE_UNDEFINED) {
    _opl3.setKeyOn(drumChannelsOPL[oplChannelIndex], false);

    _eventIndex++;
    _drums[oplChannelIndex].eventIndex = _eventIndex;
    _drums[oplChannelIndex].note = note;
    _drums[oplChannelIndex].noteVelocity = log(min((float)velocity, 127.0)) / log(127.0);

    if (_drums[oplChannelIndex].program != program) {
      Instrument drumInstrument = _opl3.loadInstrument(midiDrums[program]);
      _drums[oplChannelIndex].program = program;
      _drums[oplChannelIndex].transpose = drumInstrument.transpose;
      _opl3.setInstrument(drumChannelsOPL[oplChannelIndex], drumInstrument,
                          log(min((float)velocity, 127.0)) / log(127.0));
    }

    _opl3.playNote(drumChannelsOPL[oplChannelIndex],
                   _drums[oplChannelIndex].transpose / 12,
                   _drums[oplChannelIndex].transpose % 12);
  }
}

void OplSynth::setOplChannelVolume(uint8_t channel4OP, uint8_t midiChannel) {
  if (midiChannel == MIDI_DRUM_CHANNEL) return;

  Instrument4OP instrument = _midi[midiChannel].instrument;
  // Effective level = note velocity * channel volume (CC7) * expression (CC11).
  float volume = _melodic[channel4OP].noteVelocity
               * _midi[midiChannel].volume
               * _midi[midiChannel].expression;
  for (uint8_t i = 0; i < 2; i++) {
    float op1Level = (float)(63 - instrument.subInstrument[i].operators[OPERATOR1].outputLevel) / 63.0;
    float op2Level = (float)(63 - instrument.subInstrument[i].operators[OPERATOR2].outputLevel) / 63.0;
    uint8_t volumeOp1 = round(op1Level * volume * 63.0);
    uint8_t volumeOp2 = round(op2Level * volume * 63.0);
    _opl3.setVolume(_opl3.get4OPControlChannel(channel4OP, i), OPERATOR1, 63 - volumeOp1);
    _opl3.setVolume(_opl3.get4OPControlChannel(channel4OP, i), OPERATOR2, 63 - volumeOp2);
  }
}

// Apply the MIDI channel's pan to both 2-op halves of a 4-op voice. OPL3 panning
// is the chip's L/R enable bits, so this is hard-left / center / hard-right.
void OplSynth::applyPanning(uint8_t channel4OP, uint8_t midiChannel) {
  bool left = _midi[midiChannel].panLeft;
  bool right = _midi[midiChannel].panRight;
  _opl3.setPanning(_opl3.get4OPControlChannel(channel4OP, 0), left, right);
  _opl3.setPanning(_opl3.get4OPControlChannel(channel4OP, 1), left, right);
}

void OplSynth::noteOff(uint8_t midiChannel, uint8_t note, uint8_t velocity) {
  (void)velocity;
  midiChannel = midiChannel % NUM_MIDI_CHANNELS;

  if (midiChannel == MIDI_DRUM_CHANNEL) {
    for (uint8_t i = 0; i < NUM_DRUM_CHANNELS; i++) {
      if (_drums[i].note == note) {
        _opl3.setKeyOn(drumChannelsOPL[i], false);
        _drums[i].note = VALUE_UNDEFINED;
      }
    }
  } else {
    for (uint8_t i = 0; i < NUM_MELODIC_CHANNELS; i++) {
      if (_melodic[i].midiChannel == midiChannel && _melodic[i].note == note) {
        if (_midi[midiChannel].sustain) {
          _melodic[i].sustained = true;          // pedal down: keep ringing
        } else {
          _opl3.setKeyOn(_opl3.get4OPControlChannel(i), false);
          _melodic[i].note = VALUE_UNDEFINED;
          _melodic[i].sustained = false;
        }
      }
    }
  }
}

void OplSynth::noteOn(uint8_t midiChannel, uint8_t note, uint8_t velocity) {
  midiChannel = midiChannel % NUM_MIDI_CHANNELS;

  if (velocity == 0) {
    noteOff(midiChannel, note, velocity);
  } else if (midiChannel == MIDI_DRUM_CHANNEL) {
    playDrum(note, velocity);
  } else {
    playMelodic(midiChannel, note, velocity);
  }
}

void OplSynth::programChange(uint8_t midiChannel, uint8_t program) {
  midiChannel = midiChannel % NUM_MIDI_CHANNELS;
  if (midiChannel != MIDI_DRUM_CHANNEL) {
    program = program % 128;
    const unsigned char* instrumentDataPtr = midiInstruments[program];
    Instrument4OP instrument = _opl3.loadInstrument4OP(instrumentDataPtr);
    _midi[midiChannel].program = program;
    _midi[midiChannel].instrument = instrument;
  }
}

void OplSynth::controlChange(uint8_t midiChannel, uint8_t control, uint8_t value) {
  midiChannel = midiChannel % NUM_MIDI_CHANNELS;

  switch (control) {
    case CONTROL_MODULATION:
      _midi[midiChannel].modulation = value / 127.0;
      break;

    case CONTROL_VOLUME:
      _midi[midiChannel].volume = log(min((float)value, 127.0)) / log(127.0);
      for (uint8_t i = 0; i < NUM_MELODIC_CHANNELS; i++) {
        if (_melodic[i].midiChannel == midiChannel && _melodic[i].note != VALUE_UNDEFINED) {
          setOplChannelVolume(i, midiChannel);
        }
      }
      break;

    // CC11 Expression: per-phrase dynamics on top of channel volume.
    case CONTROL_EXPRESSION:
      _midi[midiChannel].expression = value / 127.0;
      for (uint8_t i = 0; i < NUM_MELODIC_CHANNELS; i++) {
        if (_melodic[i].midiChannel == midiChannel && _melodic[i].note != VALUE_UNDEFINED) {
          setOplChannelVolume(i, midiChannel);
        }
      }
      break;

    // CC10 Pan: OPL3 only has L/R enable bits -> hard-left / center / hard-right.
    case CONTROL_PAN:
      _midi[midiChannel].panLeft  = (value <= 84);
      _midi[midiChannel].panRight = (value >= 43);
      for (uint8_t i = 0; i < NUM_MELODIC_CHANNELS; i++) {
        if (_melodic[i].midiChannel == midiChannel && _melodic[i].note != VALUE_UNDEFINED) {
          applyPanning(i, midiChannel);
        }
      }
      break;

    // CC64 Sustain pedal: hold note-offs until released.
    case CONTROL_SUSTAIN:
      _midi[midiChannel].sustain = (value >= 64);
      if (!_midi[midiChannel].sustain) {
        for (uint8_t i = 0; i < NUM_MELODIC_CHANNELS; i++) {
          if (_melodic[i].midiChannel == midiChannel && _melodic[i].sustained) {
            _opl3.setKeyOn(_opl3.get4OPControlChannel(i), false);
            _melodic[i].note = VALUE_UNDEFINED;
            _melodic[i].sustained = false;
          }
        }
      }
      break;

    // Bank select: only one 4-op GM bank is loaded, so accept and ignore.
    case CONTROL_BANK_MSB:
    case CONTROL_BANK_LSB:
      break;

    case CONTROL_RESET_ALL:
      for (uint8_t i = 0; i < NUM_MIDI_CHANNELS; i++) {
        _midi[i].volume = log(127.0 * 0.8) / log(127.0);
        _midi[i].expression = 1.0f;
        _midi[i].modulation = 0.0f;
        _midi[i].sustain = false;
      }
      break;

    // Immediately silence everything: force the FASTEST release (0x0F) before
    // key-off so notes cut instantly, then fall through to clear note state.
    // (Release 0x00 is the *slowest* rate on OPL — using it here is what made
    // notes hang at the end of a song.)
    case CONTROL_ALL_SOUND_OFF:
      for (uint8_t i = 0; i < _opl3.getNumChannels(); i++) {
        _opl3.setRelease(i, OPERATOR1, 0x0F);
        _opl3.setRelease(i, OPERATOR2, 0x0F);
        _opl3.setKeyOn(i, false);
      }
      [[fallthrough]];

    case CONTROL_ALL_NOTES_OFF:
      for (uint8_t i = 0; i < NUM_MELODIC_CHANNELS; i++) {
        if (_melodic[i].note != VALUE_UNDEFINED) {
          noteOff(_melodic[i].midiChannel, _melodic[i].note, 0);
        }
      }
      break;

    default:
      break;
  }
}

void OplSynth::pitchChange(uint8_t midiChannel, int pitch) {
  midiChannel = midiChannel % NUM_MIDI_CHANNELS;
  float pitchBend = abs(pitch) / 8192.0;

  for (uint8_t i = 0; i < NUM_MELODIC_CHANNELS; i++) {
    if (_melodic[i].midiChannel == midiChannel) {
      uint8_t controlChannel = _opl3.get4OPControlChannel(i);
      uint8_t baseNote = (_melodic[i].note % 12) + 2;

      if (pitch < 0) {
        uint8_t fDelta = (notePitches[baseNote] - notePitches[baseNote - 2]) * pitchBend;
        _opl3.setFNumber(controlChannel, notePitches[baseNote] - fDelta);
      } else if (pitch > 0) {
        uint8_t fDelta = (notePitches[baseNote + 2] - notePitches[baseNote]) * pitchBend;
        _opl3.setFNumber(controlChannel, notePitches[baseNote] + fDelta);
      } else {
        _opl3.setFNumber(controlChannel, notePitches[baseNote]);
      }
    }
  }
}

void OplSynth::afterTouch(uint8_t midiChannel, uint8_t pressure) {
  midiChannel = midiChannel % NUM_MIDI_CHANNELS;   // guard against channel 16 -> OOB
  if (_midi[midiChannel].afterTouch == 0.0) {
    _midi[midiChannel].tAfterTouch = millis();
  }
  _midi[midiChannel].afterTouch = pressure / 127.0;
}

void OplSynth::systemReset() {
  _opl3.begin();
  _opl3.setDeepVibrato(true);
  _opl3.setDeepTremolo(true);
  _opl3.setOPL3Enabled(true);
  _opl3.setAll4OPChannelsEnabled(true);

  float defaultVolume = log(127.0 * 0.8) / log(127.0);   // ~80%

  for (uint8_t i = 0; i < NUM_MIDI_CHANNELS; i++) {
    programChange(i, 0);
    _midi[i].volume = defaultVolume;
    _midi[i].expression = 1.0f;
    _midi[i].modulation = 0.0f;
    _midi[i].afterTouch = 0.0f;
    _midi[i].tAfterTouch = 0;
    _midi[i].sustain = false;
    _midi[i].panLeft = true;
    _midi[i].panRight = true;
  }

  for (uint8_t i = 0; i < NUM_MELODIC_CHANNELS; i++) {
    _melodic[i].eventIndex = 0;
    _melodic[i].midiChannel = 0;
    _melodic[i].program = VALUE_UNDEFINED;
    _melodic[i].note = VALUE_UNDEFINED;
    _melodic[i].noteVelocity = 0.0f;
    _melodic[i].sustained = false;
  }

  for (uint8_t i = 0; i < NUM_DRUM_CHANNELS; i++) {
    _drums[i].eventIndex = 0;
    _drums[i].midiChannel = MIDI_DRUM_CHANNEL;
    _drums[i].program = VALUE_UNDEFINED;
    _drums[i].note = VALUE_UNDEFINED;
    _drums[i].noteVelocity = 0.0f;
  }

  _eventIndex = 0;
}

void OplSynth::setProgram(uint8_t channel, uint8_t program) {
  programChange(channel, program);
}

uint8_t OplSynth::program(uint8_t channel) const {
  return _midi[channel % NUM_MIDI_CHANNELS].program;
}

void OplSynth::panic() {
  // Fastest release + key-off = instant silence on every OPL channel.
  for (uint8_t i = 0; i < _opl3.getNumChannels(); i++) {
    _opl3.setRelease(i, OPERATOR1, 0x0F);
    _opl3.setRelease(i, OPERATOR2, 0x0F);
    _opl3.setKeyOn(i, false);
  }
  // Mark every voice free AND force a patch reload on the next note, so the
  // fast-release we just jammed in doesn't bleed into the next sound.
  for (uint8_t i = 0; i < NUM_MELODIC_CHANNELS; i++) {
    _melodic[i].note = VALUE_UNDEFINED;
    _melodic[i].program = VALUE_UNDEFINED;
    _melodic[i].sustained = false;
  }
  for (uint8_t i = 0; i < NUM_DRUM_CHANNELS; i++) {
    _drums[i].note = VALUE_UNDEFINED;
    _drums[i].program = VALUE_UNDEFINED;
  }
}
