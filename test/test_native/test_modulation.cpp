#include <unity.h>

#include "OplSynth.h"

/*
 * What the modulation LFO is allowed to touch.
 *
 * `update()` runs the mod-wheel / aftertouch vibrato over every melodic voice
 * slot. It never asked whether the slot was holding a note, and `noteOff`
 * leaves the slot pointed at its MIDI channel with `note` set to
 * VALUE_UNDEFINED (255). The arithmetic ran on the 255:
 *
 *     255 % 12 = 3  ->  baseNote = 5  ->  notePitches[5] = 0x198, a D#
 *
 * The key-on bit is off by then, but the OPL envelope is still in its release
 * phase and the channel is still sounding, so the tail of every released note
 * bent to D# whenever the mod wheel was up. Measured before the fix: a middle
 * C held at 0x156 came out of `update()` at 0x1A7.
 *
 * These read frequencies back out of the OPL3 library's own shadow registers,
 * so what is asserted is what would have gone to the chip.
 */

namespace {

constexpr uint8_t CHANNEL = 0;
constexpr uint8_t MIDDLE_C = 60;
constexpr uint8_t VOICE = 0;
constexpr uint8_t CC_MODULATION = 1;
constexpr uint8_t CC_SUSTAIN = 64;

OplSynth* synth = nullptr;

/** Run the LFO for a while, as loop() would. */
void runTheLfo() {
  for (unsigned long t = 10; t <= 60; t += 10) {
    setMillis(t);
    synth->update();
  }
}

short playMiddleC() {
  synth->noteOn(CHANNEL, MIDDLE_C, 100);
  return synth->voiceFNumber(VOICE);
}

}  // namespace

void setUp() {
  setMillis(0);
  synth = new OplSynth();
  synth->begin();
  synth->programChange(CHANNEL, 0);
}

void tearDown() {
  delete synth;
  synth = nullptr;
}

void a_released_note_keeps_the_pitch_it_was_played_at() {
  short played = playMiddleC();
  synth->controlChange(CHANNEL, CC_MODULATION, 127);
  synth->noteOff(CHANNEL, MIDDLE_C, 0);

  runTheLfo();

  TEST_ASSERT_EQUAL_HEX16(played, synth->voiceFNumber(VOICE));
}

void two_released_notes_do_not_end_up_at_the_same_pitch() {
  /*
   * The signature of the bug, rather than one number from it.
   *
   * `255 % 12` does not depend on what was played, so every released voice was
   * given the same D# — a C and an E released together converged. Asserting
   * "not exactly 0x198" would not have caught it: the vibrato offset is added
   * afterwards, so the value was never exactly D# and such a test passes while
   * the bug is present. This one cannot.
   */
  synth->noteOn(CHANNEL, MIDDLE_C, 100);
  synth->noteOn(CHANNEL, MIDDLE_C + 4, 100);  // an E, on the next free voice
  synth->controlChange(CHANNEL, CC_MODULATION, 127);
  synth->noteOff(CHANNEL, MIDDLE_C, 0);
  synth->noteOff(CHANNEL, MIDDLE_C + 4, 0);

  runTheLfo();

  TEST_ASSERT_NOT_EQUAL_MESSAGE(synth->voiceFNumber(0), synth->voiceFNumber(1),
                                "two released voices converged on one pitch");
}

void a_voice_that_never_played_is_left_alone() {
  // Every slot starts pointed at MIDI channel 0, so a mod wheel on channel 0
  // reached all twelve of them whether or not they had ever sounded.
  synth->controlChange(CHANNEL, CC_MODULATION, 127);

  runTheLfo();

  TEST_ASSERT_EQUAL_HEX16(0, synth->voiceFNumber(VOICE));
}

void a_held_note_still_modulates() {
  // The other direction, so the guard cannot become "never modulate anything".
  short played = playMiddleC();
  synth->controlChange(CHANNEL, CC_MODULATION, 127);

  runTheLfo();

  TEST_ASSERT_NOT_EQUAL_MESSAGE(played, synth->voiceFNumber(VOICE),
                                "a held note stopped being modulated");
}

void and_modulates_around_the_note_that_is_playing() {
  // Vibrato goes up from the note, by less than a semitone at full depth. A
  // modulation that walked to some other note's pitch would still be "not
  // equal" above.
  short played = playMiddleC();
  synth->controlChange(CHANNEL, CC_MODULATION, 127);

  runTheLfo();
  short now = synth->voiceFNumber(VOICE);

  TEST_ASSERT_GREATER_OR_EQUAL(played, now);
  TEST_ASSERT_LESS_THAN(played + 0x16, now);  // 0x16 is one semitone up from C
}

void a_note_held_by_the_sustain_pedal_still_modulates() {
  // The pedal is down, so the note is still sounding and still a note. It is
  // the case a guard written as "note off means stop" would get wrong.
  short played = playMiddleC();
  synth->controlChange(CHANNEL, CC_SUSTAIN, 127);
  synth->controlChange(CHANNEL, CC_MODULATION, 127);
  synth->noteOff(CHANNEL, MIDDLE_C, 0);

  runTheLfo();

  TEST_ASSERT_NOT_EQUAL_MESSAGE(played, synth->voiceFNumber(VOICE),
                                "a sustained note stopped being modulated");
}

void aftertouch_reaches_a_held_note_and_not_a_released_one() {
  // Aftertouch drives the same LFO by a different route, so it needs the same
  // answer; a fix keyed only on the mod wheel would leave this one wrong.
  short played = playMiddleC();
  synth->afterTouch(CHANNEL, 100);
  runTheLfo();
  TEST_ASSERT_NOT_EQUAL(played, synth->voiceFNumber(VOICE));

  synth->noteOff(CHANNEL, MIDDLE_C, 0);
  short atRelease = synth->voiceFNumber(VOICE);
  runTheLfo();

  TEST_ASSERT_EQUAL_HEX16(atRelease, synth->voiceFNumber(VOICE));
}

void with_the_wheel_down_nothing_is_written_either_way() {
  // The cheap path the comment above update() promises.
  short played = playMiddleC();
  synth->noteOff(CHANNEL, MIDDLE_C, 0);

  runTheLfo();

  TEST_ASSERT_EQUAL_HEX16(played, synth->voiceFNumber(VOICE));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(a_released_note_keeps_the_pitch_it_was_played_at);
  RUN_TEST(two_released_notes_do_not_end_up_at_the_same_pitch);
  RUN_TEST(a_voice_that_never_played_is_left_alone);
  RUN_TEST(a_held_note_still_modulates);
  RUN_TEST(and_modulates_around_the_note_that_is_playing);
  RUN_TEST(a_note_held_by_the_sustain_pedal_still_modulates);
  RUN_TEST(aftertouch_reaches_a_held_note_and_not_a_released_one);
  RUN_TEST(with_the_wheel_down_nothing_is_written_either_way);
  return UNITY_END();
}
