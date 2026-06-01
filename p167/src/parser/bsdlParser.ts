import { ChipInfo, Pin, PinType, BoundaryCell, CellFunction, ParseResult, ParsingError } from '../types';

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

function mapPinType(bsdlType: string): PinType {
  const type = bsdlType.toLowerCase().trim();
  if (type.includes('input') && type.includes('output')) return 'inout';
  if (type.includes('inout') || type.includes('bidir')) return 'inout';
  if (type.includes('buffer')) return 'output';
  if (type.includes('linkage')) return 'other';
  if (type.includes('input')) return 'input';
  if (type.includes('output')) return 'output';
  if (type.includes('power') || type.includes('vcc') || type.includes('vdd')) return 'power';
  if (type.includes('ground') || type.includes('gnd') || type.includes('vss')) return 'ground';
  if (type.includes('control')) return 'control';
  return 'other';
}

function mapCellFunction(func: string): CellFunction {
  const f = func.toUpperCase().trim();
  if (f.includes('INPUT') || f === 'IN') return 'INPUT';
  if (f.includes('OUTPUT2') || f === 'OUT2') return 'OUTPUT2';
  if (f.includes('OUTPUT') || f === 'OUT') return 'OUTPUT';
  if (f.includes('CONTROL') || f === 'CTL') return 'CONTROL';
  if (f.includes('OBSERVE') || f === 'OBS') return 'OBSERVE_ONLY';
  if (f.includes('INTERNAL')) return 'INTERNAL';
  if (f.includes('BCR')) return 'BCR';
  if (f.includes('BIDI')) return 'BIDI';
  return 'OBSERVE_ONLY';
}

function removeComments(content: string): string {
  let result = content;
  result = result.replace(/--[^\n]*/g, '');
  result = result.replace(/\n\s*\n/g, '\n');
  return result;
}

function normalizeWhitespace(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

function extractEntityName(content: string, errors: ParsingError[]): string {
  const cleanContent = removeComments(content);
  
  const patterns = [
    /entity\s+(\w+)\s+is\b/i,
    /entity\s+(\w+)\s*is/i,
    /entity\s+(\w+)/i
  ];
  
  for (const pattern of patterns) {
    const match = cleanContent.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  errors.push({ severity: 'warning', message: 'Could not extract entity name' });
  return 'UNKNOWN_DEVICE';
}

function extractPorts(content: string, errors: ParsingError[]): Pin[] {
  const pins: Pin[] = [];
  const cleanContent = removeComments(content);
  
  const portMatch = cleanContent.match(/port\s*\(([\s\S]*?)\)\s*;/i);
  if (!portMatch) {
    errors.push({ severity: 'warning', message: 'No port definitions found' });
    return pins;
  }

  const portSection = portMatch[1];
  const portDeclarations = portSection.split(';');

  for (const decl of portDeclarations) {
    const trimmed = decl.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(':');
    if (parts.length < 2) continue;

    const namesPart = parts[0].trim();
    const typePart = parts.slice(1).join(':').trim();

    const names = namesPart
      .replace(/[()]/g, '')
      .split(',')
      .map(n => n.trim())
      .filter(n => n && /^\w+$/.test(n));

    for (const name of names) {
      if (name) {
        pins.push({
          name: name,
          type: mapPinType(typePart),
          description: typePart
        });
      }
    }
  }

  return pins;
}

function extractIRLength(content: string, errors: ParsingError[]): number {
  const cleanContent = removeComments(content);
  
  const patterns = [
    /INSTRUCTION_LENGTH\s*:\s*(\d+)/i,
    /INSTRUCTION_LENGTH\s+of\s+\w+\s*:\s*entity\s+is\s+(\d+)/i,
    /attribute\s+INSTRUCTION_LENGTH\s*:\s*\w+\s*;\s*attribute\s+INSTRUCTION_LENGTH\s+of\s+\w+\s*:\s*entity\s+is\s+(\d+)/i,
    /INSTRUCTION_LENGTH\s*=\s*(\d+)/i,
    /INSTRUCTION_LENGTH\s*:\s*\w+_vector\((\d+)\s+downto\s+0\)/i
  ];
  
  for (const pattern of patterns) {
    const match = cleanContent.match(pattern);
    if (match) {
      const value = parseInt(match[1], 10);
      if (value > 0 && value < 256) {
        return value;
      }
    }
  }
  
  const genericMatch = cleanContent.match(/generic\s*\([^)]*INSTRUCTION_LENGTH\s*:\s*\w+\s*:=\s*(\d+)/i);
  if (genericMatch) {
    const value = parseInt(genericMatch[1], 10);
    if (value > 0 && value < 256) {
      return value;
    }
  }
  
  errors.push({ severity: 'error', message: 'Could not find INSTRUCTION_LENGTH' });
  return 0;
}

function extractIDCODE(content: string): string | undefined {
  const cleanContent = removeComments(content);
  
  const patterns = [
    /IDCODE_REGISTER\s*:\s*["']([xX]?[0-9A-Fa-f_]+)["']/i,
    /IDCODE_REGISTER\s+of\s+\w+\s*:\s*entity\s+is\s*["']([xX]?[0-9A-Fa-f_]+)["']/i,
    /IDCODE\s*&\s*X"([0-9A-Fa-f]+)"/i,
    /X"([0-9A-Fa-f]{8})"\s*--\s*IDCODE/i,
    /"([01]{32})"\s*--\s*IDCODE/i
  ];
  
  for (const pattern of patterns) {
    const match = cleanContent.match(pattern);
    if (match) {
      let value = match[1].replace(/_/g, '').toUpperCase();
      
      if (/^[01]{32}$/.test(value)) {
        let hex = '';
        for (let i = 0; i < 32; i += 4) {
          hex += parseInt(value.substr(i, 4), 2).toString(16).toUpperCase();
        }
        return hex;
      }
      
      value = value.replace(/^X/i, '');
      if (/^[0-9A-Fa-f]{8}$/.test(value)) {
        return value.toUpperCase();
      }
    }
  }
  
  return undefined;
}

function extractUsercode(content: string): string | undefined {
  const cleanContent = removeComments(content);
  
  const patterns = [
    /USERCODE_REGISTER\s*:\s*["']([xX]?[0-9A-Fa-f_]+)["']/i,
    /USERCODE_REGISTER\s+of\s+\w+\s*:\s*entity\s+is\s*["']([xX]?[0-9A-Fa-f_]+)["']/i,
    /USERCODE\s*&\s*X"([0-9A-Fa-f]+)"/i
  ];
  
  for (const pattern of patterns) {
    const match = cleanContent.match(pattern);
    if (match) {
      let value = match[1].replace(/_/g, '').toUpperCase();
      value = value.replace(/^X/i, '');
      if (value.length >= 4) {
        return value.toUpperCase();
      }
    }
  }
  
  return undefined;
}

function extractBoundaryCells(content: string, errors: ParsingError[]): BoundaryCell[] {
  const cells: BoundaryCell[] = [];
  const cleanContent = removeComments(content);
  
  const boundaryMatch = cleanContent.match(/BOUNDARY_REGISTER\s*:\s*([\s\S]*?)\s*;(\s|$)/i);
  if (!boundaryMatch) {
    errors.push({ severity: 'warning', message: 'No BOUNDARY_REGISTER found' });
    return cells;
  }

  const boundarySection = boundaryMatch[1];
  
  const cellPattern1 = /"(\d+)\s*\*\s*([\w_]+)\s*\*\s*([\w.\[\]()]+)\s*\*\s*(\w+)(?:\s*\*\s*([\d]+))?(?:\s*\*\s*([\w_]+))?"/g;
  let match;
  
  while ((match = cellPattern1.exec(boundarySection)) !== null) {
    const cellNumber = parseInt(match[1], 10);
    const cellFunc = match[2];
    const port = match[3];
    const safeBit = match[4] as '0' | '1';
    const disableBit = match[5] ? parseInt(match[5], 10) : undefined;
    const disableResult = match[6] as '0' | '1' | undefined;

    cells.push({
      cellNumber,
      function: mapCellFunction(cellFunc),
      port,
      safeBit,
      disableBit,
      disableResult
    });
  }

  if (cells.length === 0) {
    const cellPattern2 = /(\d+)\s*\*\s*([\w_]+)\s*\*\s*([\w.\[\]()]+)\s*\*\s*(\w+)/g;
    while ((match = cellPattern2.exec(boundarySection)) !== null) {
      cells.push({
        cellNumber: parseInt(match[1], 10),
        function: mapCellFunction(match[2]),
        port: match[3],
        safeBit: match[4] as '0' | '1'
      });
    }
  }

  if (cells.length === 0) {
    const cellPattern3 = /cell\s*\(\s*(\d+)\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*[^)]+\)/gi;
    while ((match = cellPattern3.exec(boundarySection)) !== null) {
      cells.push({
        cellNumber: parseInt(match[1], 10),
        function: mapCellFunction(match[3]),
        port: match[2],
        safeBit: '0'
      });
    }
  }

  if (cells.length === 0) {
    const cellPattern4 = /"(\d+)"[^;]*port\s*"([^"]+)"[^;]*function\s*"([^"]+)"/gi;
    while ((match = cellPattern4.exec(boundarySection)) !== null) {
      cells.push({
        cellNumber: parseInt(match[1], 10),
        function: mapCellFunction(match[3]),
        port: match[2],
        safeBit: '0'
      });
    }
  }

  cells.sort((a, b) => a.cellNumber - b.cellNumber);
  return cells;
}

function extractManufacturer(content: string): string | undefined {
  const cleanContent = removeComments(content);
  
  const patterns = [
    /manufacturer\s*:\s*["']([^"']+)["']/i,
    /manufacturer\s+of\s+\w+\s*:\s*entity\s+is\s*["']([^"']+)["']/i,
    /--\s*manufacturer\s*:\s*(\w+)/i,
    /--\s*Vendor\s*:\s*([^\n]+)/i,
    /device_package\s*:\s*["']([^"']+)["']/i
  ];
  
  for (const pattern of patterns) {
    const match = cleanContent.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  
  return undefined;
}

function extractPackage(content: string): string | undefined {
  const cleanContent = removeComments(content);
  
  const patterns = [
    /package_pin_map\s*:\s*(\w+)/i,
    /PHYSICAL_PIN_MAP\s*:\s*string\s*:=\s*["'](\w+)["']/i,
    /package_pin_map\s+of\s+\w+\s*:\s*entity\s+is\s*(\w+)/i,
    /--\s*package\s*:\s*(\w+)/i
  ];
  
  for (const pattern of patterns) {
    const match = cleanContent.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return undefined;
}

function extractPartNumber(content: string): string | undefined {
  const cleanContent = removeComments(content);
  
  const patterns = [
    /part_number\s*:\s*["']([^"']+)["']/i,
    /--\s*Part\s+Number\s*:\s*([^\n]+)/i,
    /--\s*Device\s*:\s*([^\n]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = cleanContent.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  
  return undefined;
}

function extractINSTRUCTION_OPCODE(content: string): Record<string, string> {
  const opcodes: Record<string, string> = {};
  const cleanContent = removeComments(content);
  
  const match = cleanContent.match(/INSTRUCTION_OPCODE\s*:\s*([\s\S]*?)\s*;(\s|$)/i);
  if (!match) return opcodes;
  
  const opcodeSection = match[1];
  const opcodePattern = /(\w+)\s*\(\s*([01_]+)\s*\)/g;
  
  let opcodeMatch;
  while ((opcodeMatch = opcodePattern.exec(opcodeSection)) !== null) {
    const name = opcodeMatch[1].toUpperCase();
    const code = opcodeMatch[2].replace(/_/g, '');
    opcodes[name] = code;
  }
  
  return opcodes;
}

function associatePinsWithCells(pins: Pin[], cells: BoundaryCell[]): Pin[] {
  const cellPortMap = new Map<string, number>();
  
  for (const cell of cells) {
    if (cell.port && cell.port !== '*' && cell.port !== 'NC') {
      const cleanPort = cell.port
        .replace(/\[\d+\]/g, '')
        .replace(/\(.*\)/g, '')
        .trim();
      
      if (cleanPort) {
        cellPortMap.set(cleanPort.toUpperCase(), cell.cellNumber);
        cellPortMap.set(cell.port.toUpperCase(), cell.cellNumber);
      }
    }
  }

  return pins.map(pin => {
    const cell = cellPortMap.get(pin.name.toUpperCase());
    if (cell !== undefined) {
      return { ...pin, cell };
    }
    return pin;
  });
}

export function parseBSDL(content: string, fileName: string): ParseResult {
  const errors: ParsingError[] = [];
  
  try {
    const name = extractEntityName(content, errors);
    const irLength = extractIRLength(content, errors);
    const idcode = extractIDCODE(content);
    const usercode = extractUsercode(content);
    const manufacturer = extractManufacturer(content);
    const pkg = extractPackage(content);
    const partNumber = extractPartNumber(content);
    const instructionOpcodes = extractINSTRUCTION_OPCODE(content);
    let pins = extractPorts(content, errors);
    const boundaryCells = extractBoundaryCells(content, errors);
    
    pins = associatePinsWithCells(pins, boundaryCells);

    const chip: ChipInfo = {
      id: generateId(),
      name,
      fileName,
      irLength,
      idcode,
      usercode,
      pins,
      boundaryCells,
      parsedAt: new Date(),
      package: pkg,
      manufacturer,
      partNumber,
      instructionOpcodes
    };

    const hasErrors = errors.some(e => e.severity === 'error');
    
    return {
      success: !hasErrors,
      chip,
      errors
    };
  } catch (error) {
    errors.push({
      severity: 'error',
      message: `Parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
    return {
      success: false,
      errors
    };
  }
}

export function validateBSDL(content: string): boolean {
  const cleanContent = removeComments(content);
  const hasEntity = /entity\s+\w+\s+is\b/i.test(cleanContent);
  const hasPort = /port\s*\(/i.test(cleanContent);
  const hasIRLength = /INSTRUCTION_LENGTH\s*:/i.test(cleanContent);
  return hasEntity && hasPort && hasIRLength;
}

export function getSampleBSDL(): string {
  return `-- Sample BSDL File for demonstration
-- This is a simplified example

entity SAMPLE_DEVICE is
generic (PHYSICAL_PIN_MAP : string := "TQFP144");

port (
    TCK     : in    bit;
    TMS     : in    bit;
    TDI     : in    bit;
    TDO     : out   bit;
    -- GPIO Pins
    PA0     : inout bit;
    PA1     : inout bit;
    PA2     : inout bit;
    PA3     : inout bit;
    PB0     : inout bit;
    PB1     : inout bit;
    PB2     : inout bit;
    PB3     : inout bit;
    -- Power/Ground
    VCC     : in    bit;
    GND     : in    bit
);

use STD_1149_1_2001.all;

attribute COMPONENT_CONFORMANCE of SAMPLE_DEVICE : entity is "STD_1149_1_2001";

attribute PIN_MAP of SAMPLE_DEVICE : entity is PHYSICAL_PIN_MAP;

constant TQFP144 : PIN_MAP_STRING :=
    "TCK:1, TMS:2, TDI:3, TDO:4, " &
    "PA0:5, PA1:6, PA2:7, PA3:8, " &
    "PB0:9, PB1:10, PB2:11, PB3:12, " &
    "VCC:13, GND:14";

attribute TAP_SCAN_IN of TDI : signal is true;
attribute TAP_SCAN_OUT of TDO : signal is true;
attribute TAP_SCAN_MODE of TMS : signal is true;
attribute TAP_SCAN_CLOCK of TCK : signal is (10.0e6, BOTH);

attribute INSTRUCTION_LENGTH of SAMPLE_DEVICE : entity is 4;

attribute INSTRUCTION_OPCODE of SAMPLE_DEVICE : entity is
    "BYPASS (1111), " &
    "EXTEST (0000), " &
    "SAMPLE (0001), " &
    "PRELOAD (0001), " &
    "IDCODE (0010), " &
    "USERCODE (0011)";

attribute INSTRUCTION_CAPTURE of SAMPLE_DEVICE : entity is "0001";

attribute IDCODE_REGISTER of SAMPLE_DEVICE : entity is
    "0001" &           -- version
    "01001010001" &    -- part number
    "00001110101" &    -- manufacturer
    "1";               -- required

attribute BOUNDARY_REGISTER of SAMPLE_DEVICE : entity is
    -- cell  function  port           safe  disable result
    "  0    *  OUTPUT  *  PA0        *  0  *",
    "  1    *  INPUT   *  PA0        *  0  *",
    "  2    *  OUTPUT  *  PA1        *  0  *",
    "  3    *  INPUT   *  PA1        *  0  *",
    "  4    *  OUTPUT  *  PA2        *  0  *",
    "  5    *  INPUT   *  PA2        *  0  *",
    "  6    *  OUTPUT  *  PA3        *  0  *",
    "  7    *  INPUT   *  PA3        *  0  *",
    "  8    *  OUTPUT  *  PB0        *  0  *",
    "  9    *  INPUT   *  PB0        *  0  *",
    " 10    *  OUTPUT  *  PB1        *  0  *",
    " 11    *  INPUT   *  PB1        *  0  *",
    " 12    *  OUTPUT  *  PB2        *  0  *",
    " 13    *  INPUT   *  PB2        *  0  *",
    " 14    *  OUTPUT  *  PB3        *  0  *",
    " 15    *  INPUT   *  PB3        *  0  *";

end SAMPLE_DEVICE;
`;
}
