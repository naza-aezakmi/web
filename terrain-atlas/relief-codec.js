"use strict";

// Decode relief profile v2 after native gzip decompression. Legacy tiles have no header.
function decodeReliefProfile(buffer, count, samples, earth) {
  const cellSize = samples ** 2;
  const stride = cellSize * 2 + (earth ? 4 : 0);
  if (buffer.byteLength === count * stride) return buffer;

  const input = new Uint8Array(buffer);
  const data = new DataView(buffer);
  const version2 = input[0] === 82 && input[1] === 76 && input[2] === 70 && input[3] === 50;
  const header = 8;
  const indexBytes = earth ? count * 4 : 0;
  const length = count * cellSize;
  const planeLength = Math.ceil(length / 8);
  if (!version2 || data.getUint32(4, true) !== count ||
      buffer.byteLength !== header + indexBytes + planeLength * 16) {
    throw new Error("invalid compressed relief profile");
  }

  const packed = new Uint16Array(length + 7);
  for (let bit = 0; bit < 16; bit++) {
    const start = header + indexBytes + bit * planeLength;
    const mask = 1 << bit;
    for (let i = 0; i < planeLength; i++) {
      let ones = input[start + i];
      while (ones) {
        const low = ones & -ones;
        const offset = i * 8 + 31 - Math.clz32(low);
        packed[offset] |= mask;
        ones ^= low;
      }
    }
  }

  const output = new ArrayBuffer(count * stride);
  const view = new DataView(output);
  const heights = new Int16Array(cellSize);
  let index = 0;
  let position = 0;
  for (let cell = 0; cell < count; cell++) {
    let offset = cell * stride;
    if (earth) {
      const start = header + cell;
      const delta = input[start] | input[start + count] << 8 |
        input[start + count * 2] << 16 | input[start + count * 3] << 24;
      index = (index + delta) >>> 0;
      view.setUint32(offset, index, true);
      offset += 4;
    }
    for (let row = 0; row < samples; row++) {
      for (let column = 0; column < samples; column++) {
        const p = row * samples + column;
        const value = packed[position++];
        let height = (value >>> 1) ^ -(value & 1);
        if (row > 0) height += heights[p - samples];
        if (column > 0) height += heights[p - 1];
        if (row > 0 && column > 0) height -= heights[p - samples - 1];
        heights[p] = height;
        view.setInt16(offset + 2 * p, heights[p], true);
      }
    }
  }
  return output;
}
