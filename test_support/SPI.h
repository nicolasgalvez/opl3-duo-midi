#pragma once
/*
 * A do-nothing SPI, because the bytes are not the point.
 *
 * The OPL3 library keeps shadow registers of everything it sends, so what the
 * chip would hold is readable from the library itself. Recording the wire
 * bytes here would only re-derive that, less legibly.
 */
#include <cstdint>

#define MSBFIRST 1
#define SPI_MODE0 0

class SPISettings {
 public:
  SPISettings() {}
  SPISettings(uint32_t, uint8_t, uint8_t) {}
};

class SPIStub {
 public:
  void begin() {}
  void end() {}
  void beginTransaction(SPISettings) {}
  void endTransaction() {}
  uint8_t transfer(uint8_t value) { return value; }
};

extern SPIStub SPI;
