// Raw OPL2/OPL3 register-write SysEx protocol for the OPL3 Duo's own firmware
// (src/main.cpp onSysEx handler). Unrelated to mt32-pi's device-control SysEx
// in lib/net/mt32pi.mjs, despite sharing the same manufacturer ID 0x7D (MIDI's
// non-commercial/educational ID) — different target device, disambiguated by
// the 0x7F sub-command byte.
//
//   F0 7D 7F <bank> <regHiNibble> <regLoNibble> <valHiNibble> <valLoNibble> F7
//
// Register and value are each split into two 7-bit-safe nibble bytes since raw
// OPL registers/values span the full 0x00-0xFF byte range, which SysEx data
// bytes (max 0x7F) can't carry directly.

const MANUFACTURER_ID = 0x7d
const RAW_WRITE = 0x7f

export function rawWriteSysEx(bank, reg, value) {
  return [
    0xf0,
    MANUFACTURER_ID,
    RAW_WRITE,
    bank & 0x03,
    (reg >> 4) & 0x0f,
    reg & 0x0f,
    (value >> 4) & 0x0f,
    value & 0x0f,
    0xf7,
  ]
}

// OPL3Duo::write(bank, reg, value) addresses a register bank as
// (synthUnit << 1) | registerPort, where synthUnit selects which of the Duo's
// two physical chips [0,1] and registerPort selects the OPL3's register port
// [0,1] (YMF262 command 0x5E writes port 0, 0x5F writes port 1). We always
// target synthUnit 0 — routing across both chips is out of scope (ODM-15).
export function bankForPort(port, synthUnit = 0) {
  return (synthUnit << 1) | (port & 0x01)
}
