#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cli.parser import parse_hex_temperature

test_cases = [
    ('0x1a00', 26.0),
    ('0x1a80', 26.5),
    ('0x0028', 0.15625),
    ('0xff20', -0.875),
    ('0xfe00', -2.0),
]

for hex_str, expected in test_cases:
    result = parse_hex_temperature(hex_str)
    match = result == expected
    status = "✓" if match else "✗"
    print(f"{status} {hex_str} -> {result!r} (expected: {expected!r})")
    
    if hex_str == '0xff20' and not match:
        print("  Debug info:")
        hex_clean = hex_str.replace('0x', '').replace('h', '')
        int_value = int(hex_clean, 16)
        print(f"    int_value: {int_value}, hex: {hex(int_value)}")
        if int_value >= 0x8000:
            int_value2 = int_value - 0x10000
            print(f"    after sign conversion: {int_value2}")
        else:
            int_value2 = int_value
        integer_part = (int_value2 >> 8) & 0xFF
        fractional_part = int_value2 & 0xFF
        print(f"    integer_part: {integer_part}, fractional_part: {fractional_part}")
        if int_value2 < 0:
            integer_part = integer_part - 256
            print(f"    adjusted integer_part: {integer_part}")
        temp = integer_part + (fractional_part / 256.0)
        print(f"    final temp: {temp}")
