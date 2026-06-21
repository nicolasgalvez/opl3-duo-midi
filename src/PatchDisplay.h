#pragma once
#include <Arduino.h>
#include "Config.h"

#if OLED_ENABLED
  #include <Wire.h>
  #include <Adafruit_GFX.h>
  #include <Adafruit_SSD1306.h>
#endif

// Shows the current patch number + name on an SSD1306. show() is cheap and safe
// to call from the hot loop — it only flags the screen dirty. update() does the
// slow I2C write, but at most once per cfg::OLED_REDRAW_MS and only when dirty,
// so rendering can never starve usbMIDI.read(). With OLED_ENABLED 0 every method
// is an empty no-op and no Adafruit code is compiled in.
class PatchDisplay {
public:
  void begin();
  void show(int program, const char* name);
  void update(uint32_t nowMs);

private:
#if OLED_ENABLED
  void render();
  Adafruit_SSD1306 _oled{cfg::OLED_WIDTH, cfg::OLED_HEIGHT, &Wire, -1};
  bool _ok = false;
#endif
  int         _program  = -1;
  const char* _name     = "";
  bool        _dirty    = false;
  uint32_t    _lastDraw = 0;
};
