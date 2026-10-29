// Decodes a JSON snapshot whether Apache sent it as ASCII or as raw EBCDIC (IBM-1047): many
// z/OS Apache setups only convert text/* types, and JSON is application/json.

// IBM-1047 byte -> ISO8859-1 code point, two hex digits per byte, as z/OS converts it
// (glibc's iconv table with NL 0x15 mapped to LF and 0x25 to NEL).
const TABLE = '000102039c09867f978d8e0b0c0d0e0f101112139d0a08871819928f1c1d1e1f808182838485171b88898a8b8c050607909116939495960498999a9b14159e1a20a0e2e4e0e1e3e5e7f1a22e3c282b7c26e9eaebe8edeeefecdf21242a293b5e2d2fc2c4c0c1c3c5c7d1a62c255f3e3ff8c9cacbc8cdcecfcc603a2340273d22d8616263646566676869abbbf0fdfeb1b06a6b6c6d6e6f707172aabae6b8c6a4b57e737475767778797aa1bfd05bdeaeaca3a5b7a9a7b6bcbdbedda8af5db4d77b414243444546474849adf4f6f2f3f57d4a4b4c4d4e4f505152b9fbfcf9faff5cf7535455565758595ab2d4d6d2d3d530313233343536373839b3dbdcd9da9f';
const LATIN1 = Array.from({ length: 256 }, (_, i) => String.fromCharCode(parseInt(TABLE.slice(i * 2, i * 2 + 2), 16)));

// A snapshot always starts with { or [, which are 0xC0 / 0xAD in IBM-1047.
const isEbcdic = (bytes) => bytes[0] === 0xc0 || bytes[0] === 0xad;

export function decodeJson(buffer) {
  const bytes = new Uint8Array(buffer);
  if (!isEbcdic(bytes)) return JSON.parse(new TextDecoder().decode(bytes));
  let text = '';
  for (const b of bytes) text += LATIN1[b];
  return JSON.parse(text);
}
