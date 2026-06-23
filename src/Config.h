#pragma once
#include <Arduino.h>

// ============================================================================
//  Hardware / behaviour configuration. Everything wiring-related lives here so
//  the rest of the code never hardcodes a pin.
//
//  The OPL3 Duo bus already uses Teensy pins 6,7,8,9,10,11(MOSI),13(SCK) — do
//  NOT reuse those for the encoder/OLED.
// ============================================================================

// Set to 1 once the SSD1306 OLED is wired. While 0, PatchDisplay compiles to
// no-ops and pulls in no Adafruit dependency.  (Use 0/1, not false/true — this
// macro is evaluated by the preprocessor with #if.)
#define OLED_ENABLED 0

namespace cfg {

// ---- OPL3 Duo control pins:  OPL3Duo(a2, a1, a0, latch, reset) ----------
constexpr uint8_t OPL3_A2 = 6;      // -> A2
constexpr uint8_t OPL3_A1 = 7;      // -> A1
constexpr uint8_t OPL3_A0 = 8;      // -> A0
constexpr uint8_t OPL3_LATCH = 10;  // -> /WR
constexpr uint8_t OPL3_RESET = 9;   // -> /IC

// ---- Rotary encoder + push-button (CHANGE TO YOUR WIRING) --------------
constexpr uint8_t ENC_PIN_A = 3;    // encoder channel A
constexpr uint8_t ENC_PIN_B = 4;    // encoder channel B
constexpr uint8_t ENC_BTN_PIN = 5;  // push-button to GND (uses INPUT_PULLUP)

// Quadrature counts the library reports per physical detent. Most mechanical
// encoders emit 4; set to 1 or 2 if yours steps too slowly/quickly.
constexpr int8_t ENC_COUNTS_PER_DETENT = 4;

// ---- Patch selection ---------------------------------------------------
constexpr uint8_t ENC_TARGET_CHANNEL = 0;  // 0-based MIDI channel the knob re-patches
constexpr uint8_t GM_PROGRAM_MIN = 0;
constexpr uint8_t GM_PROGRAM_MAX = 127;

// ---- OLED (SSD1306) ----------------------------------------------------
constexpr uint8_t OLED_ADDRESS = 0x3C;  // 0x3C typical; 0x3D on some 128x64
constexpr uint8_t OLED_WIDTH = 128;
constexpr uint8_t OLED_HEIGHT = 64;
constexpr uint32_t OLED_REDRAW_MS = 33;  // ~30 fps cap so the screen can't starve MIDI

// ---- L/R VU LEDs -------------------------------------------------------
// Brightness tracks the MIDI-derived left/right level (velocity x CC7 x CC11,
// split by pan). MUST be PWM pins to dim. On Teensy 4.1 pins 30/31/32 have NO
// PWM, so the nearest PWM pins (28/29) are used; change these if you rewire.
constexpr bool LED_VU_ENABLED = true;
constexpr uint8_t LED_L_PIN = 28;  // left  VU LED (PWM)
constexpr uint8_t LED_R_PIN = 29;  // right VU LED (PWM)

}  // namespace cfg
