#include "PatchDisplay.h"

#if OLED_ENABLED

void PatchDisplay::begin() {
  Wire.begin();
  // Fail soft: if the panel isn't found we keep running so MIDI still works.
  _ok = _oled.begin(SSD1306_SWITCHCAPVCC, cfg::OLED_ADDRESS);
  if (!_ok) return;
  _oled.clearDisplay();
  _oled.setTextWrap(false);
  _oled.display();
}

void PatchDisplay::show(int program, const char* name) {
  if (program == _program && name == _name) return;
  _program = program;
  _name = name;
  _dirty = true;
}

void PatchDisplay::update(uint32_t nowMs) {
  if (!_ok || !_dirty) return;
  if (nowMs - _lastDraw < cfg::OLED_REDRAW_MS) return;
  _lastDraw = nowMs;
  _dirty = false;
  render();
}

void PatchDisplay::render() {
  _oled.clearDisplay();

  _oled.setTextSize(1);
  _oled.setCursor(0, 0);
  _oled.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
  _oled.println(F("General MIDI:"));

  _oled.setTextColor(SSD1306_WHITE, SSD1306_BLACK);
  _oled.setCursor(96, 0);
  _oled.println(_program);

  _oled.setCursor(0, 24);
  _oled.setTextSize(2);
  _oled.println(_name);

  _oled.display();
}

#else  // ---- OLED disabled: empty no-ops, zero Adafruit dependency ----------

void PatchDisplay::begin() {}
void PatchDisplay::show(int, const char*) {}
void PatchDisplay::update(uint32_t) {}

#endif
