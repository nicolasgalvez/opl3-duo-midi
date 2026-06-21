#pragma once
#include <Arduino.h>
#include <Encoder.h>     // bundled with Teensyduino
#include <Bounce2.h>     // bundled with Teensyduino

// A rotary encoder + push-button that maps detents onto an integer value in
// [minValue, maxValue], wrapping at the ends. Fully non-blocking: update() is
// cheap and must be called from loop() alongside usbMIDI.read().
class PatchEncoder {
public:
  PatchEncoder(uint8_t pinA, uint8_t pinB, uint8_t pinButton,
               int minValue, int maxValue, int initial = 0);

  void begin();

  // Poll encoder + button. Returns true if value() changed since last call.
  bool update();

  // True exactly once per debounced button press.
  bool buttonPressed();

  int  value() const { return _value; }
  void setValue(int v);

private:
  static long divFloor(long a, long b);

  Encoder          _encoder;
  Button           _button;   // Bounce2's Button class (global ns in the bundled version)
  uint8_t          _pinButton;
  int              _min;
  int              _max;
  int              _value;
  long             _lastDetent;
};
