// Salsa20 implementation for GT7 telemetry decryption
// Based on the Salsa20 spec by D.J. Bernstein

function rotl(v: number, n: number): number {
  return ((v << n) | (v >>> (32 - n))) >>> 0;
}

function salsa20Core(input: Uint32Array): Uint32Array {
  const x = new Uint32Array(input);
  for (let i = 0; i < 10; i++) {
    // Column round
    x[4] ^= rotl((x[0] + x[12]) >>> 0, 7);
    x[8] ^= rotl((x[4] + x[0]) >>> 0, 9);
    x[12] ^= rotl((x[8] + x[4]) >>> 0, 13);
    x[0] ^= rotl((x[12] + x[8]) >>> 0, 18);
    x[9] ^= rotl((x[5] + x[1]) >>> 0, 7);
    x[13] ^= rotl((x[9] + x[5]) >>> 0, 9);
    x[1] ^= rotl((x[13] + x[9]) >>> 0, 13);
    x[5] ^= rotl((x[1] + x[13]) >>> 0, 18);
    x[14] ^= rotl((x[10] + x[6]) >>> 0, 7);
    x[2] ^= rotl((x[14] + x[10]) >>> 0, 9);
    x[6] ^= rotl((x[2] + x[14]) >>> 0, 13);
    x[10] ^= rotl((x[6] + x[2]) >>> 0, 18);
    x[3] ^= rotl((x[15] + x[11]) >>> 0, 7);
    x[7] ^= rotl((x[3] + x[15]) >>> 0, 9);
    x[11] ^= rotl((x[7] + x[3]) >>> 0, 13);
    x[15] ^= rotl((x[11] + x[7]) >>> 0, 18);
    // Row round
    x[1] ^= rotl((x[0] + x[3]) >>> 0, 7);
    x[2] ^= rotl((x[1] + x[0]) >>> 0, 9);
    x[3] ^= rotl((x[2] + x[1]) >>> 0, 13);
    x[0] ^= rotl((x[3] + x[2]) >>> 0, 18);
    x[6] ^= rotl((x[5] + x[4]) >>> 0, 7);
    x[7] ^= rotl((x[6] + x[5]) >>> 0, 9);
    x[4] ^= rotl((x[7] + x[6]) >>> 0, 13);
    x[5] ^= rotl((x[4] + x[7]) >>> 0, 18);
    x[11] ^= rotl((x[10] + x[9]) >>> 0, 7);
    x[8] ^= rotl((x[11] + x[10]) >>> 0, 9);
    x[9] ^= rotl((x[8] + x[11]) >>> 0, 13);
    x[10] ^= rotl((x[9] + x[8]) >>> 0, 18);
    x[12] ^= rotl((x[15] + x[14]) >>> 0, 7);
    x[13] ^= rotl((x[12] + x[15]) >>> 0, 9);
    x[14] ^= rotl((x[13] + x[12]) >>> 0, 13);
    x[15] ^= rotl((x[14] + x[13]) >>> 0, 18);
  }
  const out = new Uint32Array(16);
  for (let i = 0; i < 16; i++) out[i] = (x[i] + input[i]) >>> 0;
  return out;
}

export function salsa20Decrypt(data: Buffer, key: Buffer, iv: Buffer): Buffer {
  const sigma = Buffer.from("expand 32-byte k", "ascii");
  const out = Buffer.alloc(data.length);
  const keyWords = new Uint32Array(key.buffer, key.byteOffset, 8);
  const ivWords = new Uint32Array(iv.buffer, iv.byteOffset, 2);
  const sigmaWords = new Uint32Array(sigma.buffer, sigma.byteOffset, 4);

  let counter = 0;
  for (let offset = 0; offset < data.length; offset += 64) {
    const input = new Uint32Array(16);
    input[0] = sigmaWords[0];
    input[1] = keyWords[0];
    input[2] = keyWords[1];
    input[3] = keyWords[2];
    input[4] = keyWords[3];
    input[5] = sigmaWords[1];
    input[6] = ivWords[0];
    input[7] = ivWords[1];
    input[8] = counter & 0xffffffff;
    input[9] = (counter / 0x100000000) >>> 0;
    input[10] = sigmaWords[2];
    input[11] = keyWords[4];
    input[12] = keyWords[5];
    input[13] = keyWords[6];
    input[14] = keyWords[7];
    input[15] = sigmaWords[3];

    const block = salsa20Core(input);
    const blockBytes = Buffer.from(block.buffer);
    const len = Math.min(64, data.length - offset);
    for (let i = 0; i < len; i++) {
      out[offset + i] = data[offset + i] ^ blockBytes[i];
    }
    counter++;
  }
  return out;
}
