export interface Complex {
  re: number;
  im: number;
}

function bitReverse(n: number, bits: number): number {
  let result = 0;
  for (let i = 0; i < bits; i++) {
    result = (result << 1) | (n & 1);
    n >>= 1;
  }
  return result;
}

function log2(n: number): number {
  let result = 0;
  while ((1 << result) < n) result++;
  return result;
}

export function fft(input: Complex[]): Complex[] {
  const N = input.length;
  const bits = log2(N);
  const output: Complex[] = new Array(N);

  for (let i = 0; i < N; i++) {
    const j = bitReverse(i, bits);
    output[i] = { re: input[j].re, im: input[j].im };
  }

  for (let size = 2; size <= N; size *= 2) {
    const halfSize = size / 2;
    const angle = (-2 * Math.PI) / size;
    for (let i = 0; i < N; i += size) {
      for (let j = 0; j < halfSize; j++) {
        const wAngle = angle * j;
        const w: Complex = {
          re: Math.cos(wAngle),
          im: Math.sin(wAngle),
        };
        const even = output[i + j];
        const odd = output[i + j + halfSize];
        const t: Complex = {
          re: w.re * odd.re - w.im * odd.im,
          im: w.re * odd.im + w.im * odd.re,
        };
        output[i + j] = {
          re: even.re + t.re,
          im: even.im + t.im,
        };
        output[i + j + halfSize] = {
          re: even.re - t.re,
          im: even.im - t.im,
        };
      }
    }
  }

  return output;
}

export function ifft(input: Complex[]): Complex[] {
  const N = input.length;
  const conjugated: Complex[] = input.map((c) => ({ re: c.re, im: -c.im }));
  const result = fft(conjugated);
  return result.map((c) => ({ re: c.re / N, im: -c.im / N }));
}
