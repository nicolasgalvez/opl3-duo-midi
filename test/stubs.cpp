#include "Arduino.h"
#include "SPI.h"

SPIStub SPI;

namespace {
unsigned long fakeNow = 0;
}

unsigned long millis() { return fakeNow; }
void setMillis(unsigned long ms) { fakeNow = ms; }
