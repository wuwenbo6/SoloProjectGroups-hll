export const encodeUcs2 = (text: string): { hex: string; length: number } => {
  let hex = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    hex += code.toString(16).padStart(4, '0').toUpperCase();
  }
  return { hex, length: hex.length / 2 };
};

export const decodeUcs2 = (hex: string): string => {
  let result = '';
  for (let i = 0; i < hex.length; i += 4) {
    const code = parseInt(hex.substr(i, 4), 16);
    result += String.fromCharCode(code);
  }
  return result;
};
