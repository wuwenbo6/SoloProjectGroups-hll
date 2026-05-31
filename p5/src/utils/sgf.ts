import { Move } from '../store/gameStore';

const letters = 'abcdefghijklmnopqrs';

export function generateSGF(
  moves: Move[],
  boardSize: number,
  blackPlayer: string,
  whitePlayer: string,
  winner: string,
  date: string = new Date().toISOString().split('T')[0]
): string {
  const sgfLines: string[] = [];
  
  sgfLines.push('(;');
  sgfLines.push(`GM[1]`);
  sgfLines.push(`FF[4]`);
  sgfLines.push(`CA[UTF-8]`);
  sgfLines.push(`SZ[${boardSize}]`);
  sgfLines.push(`PB[${blackPlayer}]`);
  sgfLines.push(`PW[${whitePlayer}]`);
  sgfLines.push(`DT[${date}]`);
  sgfLines.push(`RE[${winner === 'black' ? 'B+' : 'W+'}]`);
  sgfLines.push(`KM[6.5]`);
  sgfLines.push(`RU[Chinese]`);
  
  for (const move of moves) {
    if (move.pass) {
      sgfLines.push(`;${move.color === 'black' ? 'B' : 'W'}[]`);
    } else {
      const x = letters[move.x] || '';
      const y = letters[move.y] || '';
      sgfLines.push(`;${move.color === 'black' ? 'B' : 'W'}[${x}${y}]`);
    }
  }
  
  sgfLines.push(')');
  
  return sgfLines.join('\n');
}

export function downloadSGF(filename: string, sgfContent: string): void {
  const blob = new Blob([sgfContent], { type: 'application/x-go-sgf;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseSGFCoordinate(coord: string): { x: number; y: number } | null {
  if (coord.length !== 2) return null;
  const x = letters.indexOf(coord[0].toLowerCase());
  const y = letters.indexOf(coord[1].toLowerCase());
  if (x === -1 || y === -1) return null;
  return { x, y };
}
