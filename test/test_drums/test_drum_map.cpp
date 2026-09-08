#include <unity.h>

#include "OplSynth.h"

/*
 * A General MIDI drum note has to select the drum General MIDI names.
 *
 * `playDrum` indexes the library's table with `note - DRUM_NOTE_BASE`, and
 * OplSynth carried its own copy of that base saying 27 while midi_drums.h,
 * included in the same file, says 28. The copy shadowed it, so every drum came
 * out one slot high: an acoustic snare played as a hand clap, a closed hi-hat
 * as a high tom, a crash as a high tom, a ride as a tambourine.
 *
 * Both of the library's drum headers define an array called `midiDrums[]` with
 * the same sixty entries in the same order and disagree about the base — the
 * 4-op one says 27, and that is the number that ended up here.
 *
 * The expectations are indices rather than the table's own symbols because
 * `midiDrums` has external linkage: its header may be included in exactly one
 * translation unit, and that one is OplSynth.cpp. The index is the whole
 * contract with the table anyway; what each one holds is the library's
 * business, and the names are here so a reader can check them against it.
 */

namespace {

/** The index `note` selects, or -1 for a note that is not a drum. */
int programFor(uint8_t note) {
  uint8_t program = 0;
  return OplSynth::drumProgramFor(note, program) ? (int)program : -1;
}

void assertSelects(uint8_t note, int expected, const char* what) {
  TEST_ASSERT_EQUAL_INT_MESSAGE(expected, programFor(note), what);
}

}  // namespace

void setUp() {}
void tearDown() {}

void the_kick_and_the_snare_are_the_kick_and_the_snare() {
  assertSelects(35, 7, "35 Acoustic Bass Drum -> BASS_DR2");
  assertSelects(36, 8, "36 Bass Drum 1 -> BASS_DR1");
  assertSelects(38, 10, "38 Acoustic Snare -> SNARE_AC");
  assertSelects(40, 12, "40 Electric Snare -> SNARE_EL");
}

void the_hats_are_hats_and_not_toms() {
  assertSelects(42, 14, "42 Closed Hi-Hat -> HIHAT_CL");
  assertSelects(44, 16, "44 Pedal Hi-Hat -> HIHAT_PL");
  assertSelects(46, 18, "46 Open Hi-Hat -> HIHAT_OP");
}

void the_cymbals_are_cymbals() {
  assertSelects(49, 21, "49 Crash Cymbal 1 -> CRASH");
  assertSelects(51, 23, "51 Ride Cymbal 1 -> RIDE_CY");
  assertSelects(57, 29, "57 Crash Cymbal 2 -> CRASH2");
}

void the_hand_clap_is_the_hand_clap() {
  // The one the snare used to be played as, so the two cannot swap again.
  assertSelects(39, 11, "39 Hand Clap -> CLAP");
}

void both_ends_of_the_range_are_playable() {
  // 28..87, the sixty drums the 2-op table holds. Note 87 was refused outright
  // while the base was 27, because the range had been shifted down with it.
  assertSelects(28, 0, "the first drum");
  assertSelects(87, 59, "the last drum");
}

void a_note_outside_the_range_is_not_a_drum() {
  TEST_ASSERT_EQUAL_INT(-1, programFor(27));
  TEST_ASSERT_EQUAL_INT(-1, programFor(88));
  TEST_ASSERT_EQUAL_INT(-1, programFor(0));
  TEST_ASSERT_EQUAL_INT(-1, programFor(127));
}

void no_note_at_all_reaches_past_the_table() {
  // Every note a MIDI file can carry, through the synth itself. An index off
  // the end of a table of pointers is a jump to whatever was next in memory.
  constexpr uint8_t DRUM_CHANNEL = 10;  // channel 10, as GM has it
  OplSynth synth;
  synth.begin();
  for (uint8_t note = 0; note < 128; note++) {
    synth.noteOn(DRUM_CHANNEL, note, 100);
    synth.noteOff(DRUM_CHANNEL, note, 0);
  }
  TEST_PASS();
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(the_kick_and_the_snare_are_the_kick_and_the_snare);
  RUN_TEST(the_hats_are_hats_and_not_toms);
  RUN_TEST(the_cymbals_are_cymbals);
  RUN_TEST(the_hand_clap_is_the_hand_clap);
  RUN_TEST(both_ends_of_the_range_are_playable);
  RUN_TEST(a_note_outside_the_range_is_not_a_drum);
  RUN_TEST(no_note_at_all_reaches_past_the_table);
  return UNITY_END();
}
