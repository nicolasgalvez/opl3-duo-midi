#include "PatchEncoder.h"
#include "Config.h"

PatchEncoder::PatchEncoder(uint8_t pinA, uint8_t pinB, uint8_t pinButton,
                           int minValue, int maxValue, int initial)
    : _encoder(pinA, pinB),
      _pinButton(pinButton),
      _min(minValue),
      _max(maxValue),
      _value(initial),
      _lastDetent(0) {}

void PatchEncoder::begin() {
  _button.attach(_pinButton, INPUT_PULLUP);
  _button.interval(5);              // 5 ms debounce
  _button.setPressedState(LOW);     // button pulls the pin to GND
  _encoder.write(0);
  _lastDetent = 0;
}

// Floor division so detent counting is symmetric across zero (plain integer
// division truncates toward zero and would stutter around 0).
long PatchEncoder::divFloor(long a, long b) {
  long q = a / b;
  if ((a % b != 0) && ((a < 0) != (b < 0))) q--;
  return q;
}

bool PatchEncoder::update() {
  _button.update();

  long detent = divFloor(_encoder.read(), cfg::ENC_COUNTS_PER_DETENT);
  if (detent == _lastDetent) return false;

  int steps = static_cast<int>(detent - _lastDetent);
  _lastDetent = detent;

  const int range = _max - _min + 1;
  int v = _value + steps;
  while (v > _max) v -= range;      // wrap around the patch range
  while (v < _min) v += range;
  _value = v;
  return true;
}

bool PatchEncoder::buttonPressed() {
  return _button.pressed();
}

void PatchEncoder::setValue(int v) {
  if (v < _min) v = _min;
  if (v > _max) v = _max;
  _value = v;
}
