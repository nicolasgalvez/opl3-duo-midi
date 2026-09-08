#pragma once
/*
 * Just enough Arduino to build the synth on a development machine.
 *
 * The firmware's decisions — which voice takes a note, which register is
 * written, what happens when the mod wheel is up — are ordinary C++ and can be
 * checked without a Teensy. The only thing standing in the way was that every
 * file starts with <Arduino.h>.
 *
 * The pin functions are no-ops on purpose: the OPL3 library's SPI writes are
 * followed through into its own shadow registers, which is where the tests
 * read the chip's state from. Nothing here pretends to be hardware.
 */
// Pulled in before the min/max macros below, and before anything else can:
// the OPL3 library includes <algorithm> itself, and a std header parsed while
// `min` is a macro does not compile. Including them here first means that
// later include is a no-op.
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <initializer_list>
#include <limits>

typedef uint8_t byte;
typedef bool boolean;

#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2

#define PROGMEM
#define pgm_read_byte_near(addr) (*(const unsigned char*)(addr))
#define pgm_read_byte(addr) (*(const unsigned char*)(addr))

/** Milliseconds since start. Settable, so a test can drive the LFO's clock. */
unsigned long millis();
void setMillis(unsigned long ms);

inline void pinMode(uint8_t, uint8_t) {}
inline void digitalWrite(uint8_t, uint8_t) {}
inline int digitalRead(uint8_t) { return 0; }
inline void delay(unsigned long) {}
inline void delayMicroseconds(unsigned int) {}

using std::abs;
using std::cos;
using std::round;
using std::sin;

/*
 * Macros, not std::min / std::max.
 *
 * Arduino's are macros and the firmware relies on it: `min(note, 119)` mixes a
 * uint8_t with an int, and `min((float)velocity, 127.0)` a float with a double.
 * Both are ordinary on the Teensy and neither compiles against the templates,
 * so a stub using those would fail to build code that is perfectly fine.
 */
#define min(a, b) ((a) < (b) ? (a) : (b))
#define max(a, b) ((a) > (b) ? (a) : (b))
#define constrain(x, low, high) ((x) < (low) ? (low) : ((x) > (high) ? (high) : (x)))
