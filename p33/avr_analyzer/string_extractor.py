from dataclasses import dataclass, field
from typing import List, Dict, Optional
import re


@dataclass
class ExtractedString:
    address: int
    value: str
    length: int
    encoding: str
    references: List[int] = field(default_factory=list)


class StringExtractor:
    def __init__(self, firmware_data: bytes, base_addr: int = 0x0000):
        self.firmware_data = firmware_data
        self.base_addr = base_addr
        self.strings: List[ExtractedString] = []

    def extract_strings(self, min_length: int = 4) -> List[ExtractedString]:
        self.strings = []
        self._extract_ascii_strings(min_length)
        self._extract_utf16_strings(min_length)
        self.strings.sort(key=lambda s: s.address)
        return self.strings

    def _extract_ascii_strings(self, min_length: int):
        pattern = rb'[\x20-\x7e]{%d,}\x00' % min_length
        
        for match in re.finditer(pattern, self.firmware_data):
            addr = self.base_addr + match.start()
            raw_bytes = match.group()
            try:
                value = raw_bytes[:-1].decode('ascii')
                extracted = ExtractedString(
                    address=addr,
                    value=value,
                    length=len(value),
                    encoding='ascii'
                )
                self.strings.append(extracted)
            except UnicodeDecodeError:
                pass

        pattern_no_null = rb'[\x20-\x7e]{%d,}' % min_length
        for match in re.finditer(pattern_no_null, self.firmware_data):
            addr = self.base_addr + match.start()
            if any(s.address <= addr < s.address + s.length + 1 for s in self.strings):
                continue
            
            raw_bytes = match.group()
            try:
                value = raw_bytes.decode('ascii')
                extracted = ExtractedString(
                    address=addr,
                    value=value,
                    length=len(value),
                    encoding='ascii (no null)'
                )
                self.strings.append(extracted)
            except UnicodeDecodeError:
                pass

    def _extract_utf16_strings(self, min_length: int):
        min_bytes = min_length * 2
        
        i = 0
        while i < len(self.firmware_data) - min_bytes:
            try:
                end = i
                while end + 1 < len(self.firmware_data):
                    char_bytes = self.firmware_data[end:end + 2]
                    if char_bytes == b'\x00\x00':
                        break
                    end += 2
                
                if end - i >= min_bytes:
                    utf16_bytes = self.firmware_data[i:end]
                    try:
                        value = utf16_bytes.decode('utf-16le')
                        if all(32 <= ord(c) <= 126 for c in value):
                            addr = self.base_addr + i
                            extracted = ExtractedString(
                                address=addr,
                                value=value,
                                length=len(value),
                                encoding='utf-16le'
                            )
                            self.strings.append(extracted)
                    except UnicodeDecodeError:
                        pass
                i = end + 2
            except Exception:
                i += 1

    def find_string_references(self, instructions):
        from .disassembler import Instruction
        
        for extracted in self.strings:
            addr = extracted.address
            for insn in instructions:
                if insn.op_str:
                    op_str = insn.op_str.lower()
                    if f"0x{addr:x}" in op_str or f"{addr}" in op_str:
                        extracted.references.append(insn.address)

    def search_strings(self, keyword: str) -> List[ExtractedString]:
        keyword = keyword.lower()
        return [s for s in self.strings if keyword in s.value.lower()]

    def get_strings_by_length(self, min_len: int, max_len: Optional[int] = None) -> List[ExtractedString]:
        if max_len is None:
            return [s for s in self.strings if s.length >= min_len]
        return [s for s in self.strings if min_len <= s.length <= max_len]

    def print_strings(self, limit: Optional[int] = None):
        print(f"\n{'='*60}")
        print(f"EXTRACTED STRINGS ({len(self.strings)} total)")
        print(f"{'='*60}")
        print(f"{'Address':<10} {'Len':<5} {'Encoding':<15} {'Value'}")
        print(f"{'-'*60}")
        
        count = 0
        for s in self.strings:
            if limit and count >= limit:
                break
            display_value = s.value if len(s.value) < 50 else s.value[:47] + "..."
            print(f"0x{s.address:04X}    {s.length:<5} {s.encoding:<15} {display_value}")
            count += 1
        
        if limit and len(self.strings) > limit:
            print(f"\n... and {len(self.strings) - limit} more strings")

    def export_strings(self, output_file: str):
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("Address,Length,Encoding,Value\n")
            for s in self.strings:
                escaped_value = s.value.replace('"', '""')
                f.write(f"0x{s.address:04X},{s.length},{s.encoding},\"{escaped_value}\"\n")
