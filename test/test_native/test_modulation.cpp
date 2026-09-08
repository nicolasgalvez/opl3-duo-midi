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

/*
 * The other half of the same problem the drum base was.
 *
 * OplSynth keeps its own `notePitches[16]` — the library's twelve F-numbers
 * with two semitones of headroom either side for pitch bend. A note-on does
 * not use it: `playNote` writes the library's own `noteFNumbers`. Bend and
 * modulation use OplSynth's. The two tables agree today, and nothing said so,
 * exactly as nothing said the drum base had to match its table.
 *
 * Asserted through what a player would notice rather than by comparing arrays:
 * both of these move the pitch to `notePitches[note % 12 + 2]` and neither is
 * supposed to change the note.
 */

void returning_the_pitch_wheel_to_centre_changes_nothing() {
  short played = playMiddleC();

  synth->pitchChange(CHANNEL, 0);

  TEST_ASSERT_EQUAL_HEX16_MESSAGE(played, synth->voiceFNumber(VOICE),
                                  "the bend table disagrees with the note-on table");
}

void and_that_holds_for_every_note_of_the_octave() {
  // Twelve notes, twelve chances for one entry to have been mistyped.
  //
  // A fresh synth per note, because voice allocation hands successive notes to
  // successive voices: reading voice 0 twelve times over one synth compares
  // the first note against itself and passes whatever the table says.
  for (uint8_t note = 60; note < 72; note++) {
    OplSynth one;
    one.begin();
    one.programChange(CHANNEL, 0);
    one.noteOn(CHANNEL, note, 100);
    short played = one.voiceFNumber(VOICE);

    one.pitchChange(CHANNEL, 0);

    TEST_ASSERT_EQUAL_HEX16_MESSAGE(played, one.voiceFNumber(VOICE),
                                    "the bend table disagrees on one note of the octave");
  }
}

void a_note_started_while_the_wheel_is_held_is_bent_from_its_own_pitch() {
  /*
   * The bend has to be applied at note-on too, or a note played mid-bend comes
   * out unbent. That path has its own copy of the arithmetic in `playMelodic`,
   * separate from the one in `pitchChange`, and nothing exercised it.
   *
   * A note started with the wheel already up must land where the same note
   * reaches when the wheel is moved after it — the two copies have to agree.
   */
  OplSynth held;
  held.begin();
  held.programChange(CHANNEL, 0);
  held.pitchChange(CHANNEL, 8191);  // wheel up before a note is played
  held.noteOn(CHANNEL, MIDDLE_C, 100);
  short startedBent = held.voiceFNumber(VOICE);

  OplSynth bentAfter;
  bentAfter.begin();
  bentAfter.programChange(CHANNEL, 0);
  bentAfter.noteOn(CHANNEL, MIDDLE_C, 100);
  short unbent = bentAfter.voiceFNumber(VOICE);
  bentAfter.pitchChange(CHANNEL, 8191);

  TEST_ASSERT_NOT_EQUAL_MESSAGE(unbent, startedBent, "the note was not bent at all");
  TEST_ASSERT_EQUAL_HEX16_MESSAGE(bentAfter.voiceFNumber(VOICE), startedBent,
                                  "bending before a note and after it disagree");
}

void and_the_same_downwards() {
  OplSynth held;
  held.begin();
  held.programChange(CHANNEL, 0);
  held.pitchChange(CHANNEL, -8192);
  held.noteOn(CHANNEL, MIDDLE_C, 100);

  OplSynth bentAfter;
  bentAfter.begin();
  bentAfter.programChange(CHANNEL, 0);
  bentAfter.noteOn(CHANNEL, MIDDLE_C, 100);
  short unbent = bentAfter.voiceFNumber(VOICE);
  bentAfter.pitchChange(CHANNEL, -8192);

  TEST_ASSERT_LESS_THAN_MESSAGE(unbent, held.voiceFNumber(VOICE), "a downward bend went up");
  TEST_ASSERT_EQUAL_HEX16(bentAfter.voiceFNumber(VOICE), held.voiceFNumber(VOICE));
}

void the_bottom_of_a_vibrato_cycle_is_the_note_itself() {
  // The LFO adds (1 - cos-derived) * depth, which is zero at t = 0. So the
  // first pass over a held note must land exactly on the played pitch — the
  // same equality, reached through the other table user.
  short played = playMiddleC();
  synth->controlChange(CHANNEL, CC_MODULATION, 127);

  setMillis(0);
  synth->update();

  TEST_ASSERT_EQUAL_HEX16_MESSAGE(played, synth->voiceFNumber(VOICE),
                                  "the modulation table disagrees with the note-on table");
}

void a_drum_does_not_land_on_a_melodic_voice() {
  /*
   * `drumChannelsOPL` is a third restated value: the twelve 2-op channels the
   * twelve 4-op voices leave free. It is right today — the library's
   * get4OPControlChannel accounts for exactly the other twenty-four — and, as
   * with the drum base, nothing said it had to be.
   *
   * Asserted as the collision it would cause: fill every melodic voice, note
   * what each is holding, then hit every drum. A drum writing to a channel
   * that is half of a 4-op voice would move that voice's pitch.
   */
  short before[12];
  for (uint8_t v = 0; v < 12; v++) {
    synth->noteOn(CHANNEL, 60 + v, 100);
    before[v] = synth->voiceFNumber(v);
  }

  for (uint8_t note = 28; note < 40; note++) {
    synth->noteOn(10, note, 100);  // channel 10, the drums
  }

  for (uint8_t v = 0; v < 12; v++) {
    TEST_ASSERT_EQUAL_HEX16_MESSAGE(before[v], synth->voiceFNumber(v),
                                    "a drum moved a melodic voice's pitch");
  }
}

void a_note_below_the_range_is_bent_from_the_note_that_sounds() {
  /*
   * The OPL3 range this drives stops at C1, so a lower note is pulled up to it
   * and that is what the chip plays. The two bend paths used to disagree about
   * which note that was: the note-on path bent from the clamped note, the
   * wheel handler from the unclamped one it had stored. Note 20 sounds as
   * note 24 and used to bend as though it were a G#.
   */
  OplSynth low;
  low.begin();
  low.programChange(CHANNEL, 0);
  low.noteOn(CHANNEL, 20, 100);  // below the range; sounds as 24
  short sounding = low.voiceFNumber(VOICE);

  low.pitchChange(CHANNEL, 0);  // wheel at centre must not move it

  TEST_ASSERT_EQUAL_HEX16_MESSAGE(sounding, low.voiceFNumber(VOICE),
                                  "the wheel moved a clamped note off its pitch");
}

void and_one_above_it_too() {
  OplSynth high;
  high.begin();
  high.programChange(CHANNEL, 0);
  high.noteOn(CHANNEL, 126, 100);  // above the range; sounds as 119
  short sounding = high.voiceFNumber(VOICE);

  high.pitchChange(CHANNEL, 0);

  TEST_ASSERT_EQUAL_HEX16(sounding, high.voiceFNumber(VOICE));
}

void a_full_bend_up_is_two_semitones() {
  /*
   * How far the wheel reaches, not just that it moves. Middle C sits at 0x156
   * and the D two semitones above it at 0x181 — the entry `notePitches` carries
   * the headroom for. A full bend has to arrive there and no further.
   *
   * 8191 rather than 8192 is the top of the MIDI range, so the result lands a
   * count short of the interval; hence the tolerance of one.
   */
  playMiddleC();

  synth->pitchChange(CHANNEL, 8191);

  TEST_ASSERT_INT_WITHIN_MESSAGE(1, 0x181, synth->voiceFNumber(VOICE),
                                 "a full bend up did not reach two semitones");
}

void a_full_bend_down_is_two_semitones() {
  // Downwards the range is exact: -8192 is a full 1.0 of the interval, from
  // 0x156 to the A# two semitones below at 0x132.
  playMiddleC();

  synth->pitchChange(CHANNEL, -8192);

  TEST_ASSERT_EQUAL_HEX16_MESSAGE(0x132, synth->voiceFNumber(VOICE),
                                  "a full bend down did not reach two semitones");
}

void half_a_bend_is_about_one_semitone() {
  // The middle of the range, so the bend cannot be a step function that happens
  // to hit both ends.
  playMiddleC();

  synth->pitchChange(CHANNEL, 4096);

  // Half of the two-semitone interval above C: 0x156 + (0x181 - 0x156) / 2.
  TEST_ASSERT_INT_WITHIN(1, 0x156 + (0x181 - 0x156) / 2, synth->voiceFNumber(VOICE));
}

void a_note_under_the_range_sounds_as_the_lowest_one() {
  // What the clamp is for. Note 20 has no frequency on this chip; it comes out
  // as C1, and if it did not it would come out as something else entirely.
  OplSynth low;
  low.begin();
  low.programChange(CHANNEL, 0);
  low.noteOn(CHANNEL, 20, 100);

  OplSynth lowest;
  lowest.begin();
  lowest.programChange(CHANNEL, 0);
  lowest.noteOn(CHANNEL, 24, 100);

  TEST_ASSERT_EQUAL_HEX16_MESSAGE(lowest.voiceFNumber(VOICE), low.voiceFNumber(VOICE),
                                  "a note below the range did not sound as the lowest one");
}

void a_note_over_the_range_sounds_as_the_highest_one() {
  OplSynth high;
  high.begin();
  high.programChange(CHANNEL, 0);
  high.noteOn(CHANNEL, 126, 100);

  OplSynth highest;
  highest.begin();
  highest.programChange(CHANNEL, 0);
  highest.noteOn(CHANNEL, 119, 100);

  TEST_ASSERT_EQUAL_HEX16(highest.voiceFNumber(VOICE), high.voiceFNumber(VOICE));
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
  RUN_TEST(returning_the_pitch_wheel_to_centre_changes_nothing);
  RUN_TEST(and_that_holds_for_every_note_of_the_octave);
  RUN_TEST(a_note_started_while_the_wheel_is_held_is_bent_from_its_own_pitch);
  RUN_TEST(and_the_same_downwards);
  RUN_TEST(a_note_below_the_range_is_bent_from_the_note_that_sounds);
  RUN_TEST(and_one_above_it_too);
  RUN_TEST(a_full_bend_up_is_two_semitones);
  RUN_TEST(a_full_bend_down_is_two_semitones);
  RUN_TEST(half_a_bend_is_about_one_semitone);
  RUN_TEST(a_note_under_the_range_sounds_as_the_lowest_one);
  RUN_TEST(a_note_over_the_range_sounds_as_the_highest_one);
  RUN_TEST(the_bottom_of_a_vibrato_cycle_is_the_note_itself);
  RUN_TEST(a_drum_does_not_land_on_a_melodic_voice);
  return UNITY_END();
}
