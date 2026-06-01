export type ClientMessageType = 'flash' | 'read' | 'erase' | 'stop' | 'pong' | 'read_fuses' | 'write_fuses' | 'read_eeprom' | 'write_eeprom';
export type ServerMessageType = 'log' | 'progress' | 'status' | 'error' | 'complete' | 'signature_warning' | 'ping' | 'fuses_data' | 'eeprom_data';
export type LogLevel = 'info' | 'warn' | 'error' | 'success';
export type FlashStatus = 'idle' | 'connecting' | 'flashing' | 'verifying' | 'complete' | 'error' | 'reading_fuses' | 'writing_fuses' | 'reading_eeprom' | 'writing_eeprom';

export interface FuseBytes {
  low: string;
  high: string;
  extended?: string;
}

export interface ClientMessage {
  type: ClientMessageType;
  payload: {
    hexFile?: string;
    eepromFile?: string;
    mcu: string;
    programmer: string;
    port?: string;
    baudRate?: number;
    bitClock?: number;
    verifySignature?: boolean;
    fuses?: FuseBytes;
  };
}

export interface ServerMessage {
  type: ServerMessageType;
  payload: {
    message?: string;
    level?: LogLevel;
    progress?: number;
    status?: FlashStatus;
    timestamp?: number;
    expectedSignature?: string;
    actualSignature?: string;
    mcuName?: string;
    heartbeat?: number;
    fuses?: FuseBytes;
    eepromData?: string;
    eepromSize?: number;
  };
}

export interface MCUConfig {
  id: string;
  name: string;
  signature: string;
  flashSize: number;
  eepromSize: number;
}

export interface ProgrammerConfig {
  id: string;
  name: string;
  description: string;
}

export const MCU_LIST: MCUConfig[] = [
  { id: 'm328p', name: 'ATmega328P (Arduino Uno)', signature: '0x1e950f', flashSize: 32768, eepromSize: 1024 },
  { id: 'm2560', name: 'ATmega2560 (Arduino Mega)', signature: '0x1e9801', flashSize: 262144, eepromSize: 4096 },
  { id: 'm32u4', name: 'ATmega32U4 (Arduino Leonardo)', signature: '0x1e9587', flashSize: 32768, eepromSize: 1024 },
  { id: 't85', name: 'ATtiny85', signature: '0x1e930b', flashSize: 8192, eepromSize: 512 },
  { id: 'm168', name: 'ATmega168', signature: '0x1e9406', flashSize: 16384, eepromSize: 512 },
  { id: 'm8', name: 'ATmega8', signature: '0x1e9307', flashSize: 8192, eepromSize: 512 },
];

export const PROGRAMMER_LIST: ProgrammerConfig[] = [
  { id: 'usbasp', name: 'USBasp', description: 'USBasp programmer' },
  { id: 'avrisp', name: 'AVR ISP', description: 'AVR In-System Programmer' },
  { id: 'avrispmkII', name: 'AVRISP mkII', description: 'Atmel AVRISP mkII' },
  { id: 'stk500v1', name: 'STK500 v1 (Arduino)', description: 'STK500 Protocol Version 1' },
  { id: 'stk500v2', name: 'STK500 v2', description: 'STK500 Protocol Version 2' },
  { id: 'usbtiny', name: 'USBtinyISP', description: 'USBtinyISP programmer' },
  { id: 'arduino', name: 'Arduino as ISP', description: 'Using Arduino board as ISP' },
  { id: 'pololu', name: 'Pololu USB AVR', description: 'Pololu USB AVR Programmer' },
];

export interface FuseBit {
  name: string;
  description: string;
  bit: number;
  values?: { value: number; label: string }[];
}

export interface FuseByteConfig {
  name: string;
  bits: FuseBit[];
}

export interface FuseConfig {
  low: FuseByteConfig;
  high: FuseByteConfig;
  extended?: FuseByteConfig;
}

export const FUSE_CONFIGS: Record<string, FuseConfig> = {
  m328p: {
    low: {
      name: 'Low Fuse',
      bits: [
        { name: 'CKSEL0', description: 'Clock Select', bit: 0 },
        { name: 'CKSEL1', description: 'Clock Select', bit: 1 },
        { name: 'CKSEL2', description: 'Clock Select', bit: 2 },
        { name: 'CKSEL3', description: 'Clock Select', bit: 3 },
        { name: 'SUT0', description: 'Start-up Time', bit: 4 },
        { name: 'SUT1', description: 'Start-up Time', bit: 5 },
        { name: 'CKOUT', description: 'Clock Output', bit: 6 },
        { name: 'CKDIV8', description: 'Divide Clock by 8', bit: 7 },
      ],
    },
    high: {
      name: 'High Fuse',
      bits: [
        { name: 'BOOTRST', description: 'Boot Reset Vector', bit: 0 },
        { name: 'BOOTSZ0', description: 'Boot Size', bit: 1 },
        { name: 'BOOTSZ1', description: 'Boot Size', bit: 2 },
        { name: 'EESAVE', description: 'EEPROM Save', bit: 3 },
        { name: 'WDTON', description: 'Watchdog Always On', bit: 4 },
        { name: 'SPIEN', description: 'SPI Enable', bit: 5 },
        { name: 'DWEN', description: 'DebugWIRE Enable', bit: 6 },
        { name: 'RSTDISBL', description: 'Reset Disable', bit: 7 },
      ],
    },
    extended: {
      name: 'Extended Fuse',
      bits: [
        { name: 'BODLEVEL0', description: 'Brown-out Detection', bit: 0 },
        { name: 'BODLEVEL1', description: 'Brown-out Detection', bit: 1 },
        { name: 'BODLEVEL2', description: 'Brown-out Detection', bit: 2 },
        { name: 'Reserved', description: 'Reserved', bit: 3 },
        { name: 'Reserved', description: 'Reserved', bit: 4 },
        { name: 'Reserved', description: 'Reserved', bit: 5 },
        { name: 'Reserved', description: 'Reserved', bit: 6 },
        { name: 'Reserved', description: 'Reserved', bit: 7 },
      ],
    },
  },
  m2560: {
    low: {
      name: 'Low Fuse',
      bits: [
        { name: 'CKSEL0', description: 'Clock Select', bit: 0 },
        { name: 'CKSEL1', description: 'Clock Select', bit: 1 },
        { name: 'CKSEL2', description: 'Clock Select', bit: 2 },
        { name: 'CKSEL3', description: 'Clock Select', bit: 3 },
        { name: 'SUT0', description: 'Start-up Time', bit: 4 },
        { name: 'SUT1', description: 'Start-up Time', bit: 5 },
        { name: 'CKOUT', description: 'Clock Output', bit: 6 },
        { name: 'CKDIV8', description: 'Divide Clock by 8', bit: 7 },
      ],
    },
    high: {
      name: 'High Fuse',
      bits: [
        { name: 'BOOTRST', description: 'Boot Reset Vector', bit: 0 },
        { name: 'BOOTSZ0', description: 'Boot Size', bit: 1 },
        { name: 'BOOTSZ1', description: 'Boot Size', bit: 2 },
        { name: 'EESAVE', description: 'EEPROM Save', bit: 3 },
        { name: 'WDTON', description: 'Watchdog Always On', bit: 4 },
        { name: 'SPIEN', description: 'SPI Enable', bit: 5 },
        { name: 'JTAGEN', description: 'JTAG Enable', bit: 6 },
        { name: 'OCDEN', description: 'OCD Enable', bit: 7 },
      ],
    },
    extended: {
      name: 'Extended Fuse',
      bits: [
        { name: 'BODLEVEL0', description: 'Brown-out Detection', bit: 0 },
        { name: 'BODLEVEL1', description: 'Brown-out Detection', bit: 1 },
        { name: 'BODLEVEL2', description: 'Brown-out Detection', bit: 2 },
        { name: 'HWBE', description: 'Hardware Boot Enable', bit: 3 },
        { name: 'Reserved', description: 'Reserved', bit: 4 },
        { name: 'Reserved', description: 'Reserved', bit: 5 },
        { name: 'Reserved', description: 'Reserved', bit: 6 },
        { name: 'Reserved', description: 'Reserved', bit: 7 },
      ],
    },
  },
};
