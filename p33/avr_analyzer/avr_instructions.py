AVR_INSTRUCTIONS = {
    0x0000: ('nop', '', 2),
    0x9588: ('ret', '', 2),
    0x9598: ('reti', '', 2),
    0x95a8: ('sleep', '', 2),
    0x95b8: ('break', '', 2),
    0x95c8: ('wdr', '', 2),
    0x95d8: ('lpm', '', 2),
    0x95e8: ('elpm', '', 2),
    0x95f8: ('spm', '', 2),
    0x9408: ('sec', '', 2),
    0x9418: ('clc', '', 2),
    0x9428: ('sen', '', 2),
    0x9438: ('cln', '', 2),
    0x9448: ('sez', '', 2),
    0x9458: ('clz', '', 2),
    0x9468: ('sei', '', 2),
    0x9478: ('cli', '', 2),
    0x9488: ('ses', '', 2),
    0x9498: ('cls', '', 2),
    0x94a8: ('sev', '', 2),
    0x94b8: ('clv', '', 2),
    0x94c8: ('set', '', 2),
    0x94d8: ('clt', '', 2),
    0x94e8: ('seh', '', 2),
    0x94f8: ('clh', '', 2),
    0x9608: ('bset', '0', 2),
    0x9618: ('bset', '1', 2),
    0x9628: ('bset', '2', 2),
    0x9638: ('bset', '3', 2),
    0x9648: ('bset', '4', 2),
    0x9658: ('bset', '5', 2),
    0x9668: ('bset', '6', 2),
    0x9678: ('bset', '7', 2),
    0x9808: ('bclr', '0', 2),
    0x9818: ('bclr', '1', 2),
    0x9828: ('bclr', '2', 2),
    0x9838: ('bclr', '3', 2),
    0x9848: ('bclr', '4', 2),
    0x9858: ('bclr', '5', 2),
    0x9868: ('bclr', '6', 2),
    0x9878: ('bclr', '7', 2),
    0x9409: ('ijmp', '', 2),
    0x9509: ('icall', '', 2),
    0x9419: ('eijmp', '', 2),
    0x9519: ('eicall', '', 2),
}


def get_register_name(num):
    return f"r{num}"


def get_word_register_name(num):
    return f"r{num}"


def decode_avr_instruction(opcode, address):
    size = 2

    if opcode == 0x9409:
        return ('ijmp', '', 2)
    if opcode == 0x9509:
        return ('icall', '', 2)
    if opcode == 0x9419:
        return ('eijmp', '', 2)
    if opcode == 0x9519:
        return ('eicall', '', 2)

    if (opcode & 0xFE0E) == 0x940C:
        return ('jmp', '', 4)

    if (opcode & 0xFE0E) == 0x940E:
        return ('call', '', 4)

    if (opcode & 0xFC00) == 0x9000:
        if (opcode & 0x0300) == 0x0000:
            d = (opcode >> 4) & 0x1F
            k = ((opcode & 0x0F) << 6) | ((opcode >> 10) & 0x3F)
            return ('lds', f"{get_register_name(d)}, 0x{k:02X}", 2)

    if (opcode & 0xFE0F) == 0x9000:
        d = (opcode >> 4) & 0x1F
        return ('ld', f"{get_register_name(d)}, Z", 2)

    if (opcode & 0xFE0F) == 0x9001:
        d = (opcode >> 4) & 0x1F
        return ('ld', f"{get_register_name(d)}, Z+", 2)

    if (opcode & 0xFE0F) == 0x9002:
        d = (opcode >> 4) & 0x1F
        return ('ld', f"{get_register_name(d)}, -Z", 2)

    if (opcode & 0xFE0F) == 0x9004:
        d = (opcode >> 4) & 0x1F
        return ('ld', f"{get_register_name(d)}, Y", 2)

    if (opcode & 0xFE0F) == 0x9005:
        d = (opcode >> 4) & 0x1F
        return ('ld', f"{get_register_name(d)}, Y+", 2)

    if (opcode & 0xFE0F) == 0x9006:
        d = (opcode >> 4) & 0x1F
        return ('ld', f"{get_register_name(d)}, -Y", 2)

    if (opcode & 0xFE0F) == 0x9008:
        d = (opcode >> 4) & 0x1F
        return ('pop', f"{get_register_name(d)}", 2)

    if (opcode & 0xFE0F) == 0x9208:
        d = (opcode >> 4) & 0x1F
        return ('push', f"{get_register_name(d)}", 2)

    if (opcode & 0xFC00) == 0x9800:
        if (opcode & 0x0300) == 0x0000:
            r = (opcode >> 4) & 0x1F
            return ('st', f"Z, {get_register_name(r)}", 2)

    if (opcode & 0xFC00) == 0x9C00:
        r = (opcode >> 4) & 0x1F
        k = ((opcode & 0x0F) << 6) | ((opcode >> 10) & 0x3F)
        return ('sts', f"0x{k:02X}, {get_register_name(r)}", 2)

    if (opcode & 0xFC00) == 0xC000:
        k = opcode & 0x0FFF
        if k & 0x0800:
            k = k - 0x1000
        return ('rjmp', f".{k*2:+d}", 2)

    if (opcode & 0xFC00) == 0xD000:
        k = opcode & 0x0FFF
        if k & 0x0800:
            k = k - 0x1000
        return ('rcall', f".{k*2:+d}", 2)

    if (opcode & 0xFE0E) == 0xF000:
        s = (opcode >> 3) & 0x07
        k = opcode & 0x07
        if k & 0x04:
            k = k - 0x08
        branch_ops = ['brcs', 'breq', 'brmi', 'brvs', 'brlt', 'brhs', 'brts', 'brie']
        return (branch_ops[s], f".{k*2:+d}", 2)

    if (opcode & 0xFE0E) == 0xF400:
        s = (opcode >> 3) & 0x07
        k = opcode & 0x07
        if k & 0x04:
            k = k - 0x08
        branch_ops = ['brcc', 'brne', 'brpl', 'brvc', 'brge', 'brhc', 'brtc', 'brid']
        return (branch_ops[s], f".{k*2:+d}", 2)

    if (opcode & 0xFE0F) == 0x2C00:
        d = ((opcode >> 4) & 0x1F) | ((opcode >> 5) & 0x10)
        r = (opcode & 0x0F) | ((opcode >> 5) & 0x10)
        return ('mov', f"{get_register_name(d)}, {get_register_name(r)}", 2)

    if (opcode & 0xFC00) == 0x0100:
        d = ((opcode >> 4) & 0x1F) | ((opcode >> 5) & 0x10)
        d = d & 0xFE
        r = (opcode & 0x0F) | ((opcode >> 5) & 0x10)
        r = r & 0xFE
        return ('movw', f"{get_register_name(d)}, {get_register_name(r)}", 2)

    if (opcode & 0xFC00) == 0x0400:
        K = (opcode & 0x0F) | ((opcode >> 4) & 0xF0)
        d = ((opcode >> 4) & 0x10) + 16
        return ('cpc', f"{get_register_name(d)}, {get_register_name(K)}", 2)

    if (opcode & 0xFC00) == 0x0800:
        K = (opcode & 0x0F) | ((opcode >> 4) & 0xF0)
        d = ((opcode >> 4) & 0x10) + 16
        return ('sbc', f"{get_register_name(d)}, {get_register_name(K)}", 2)

    if (opcode & 0xFC00) == 0x0C00:
        K = (opcode & 0x0F) | ((opcode >> 4) & 0xF0)
        d = ((opcode >> 4) & 0x10) + 16
        return ('add', f"{get_register_name(d)}, {get_register_name(K)}", 2)

    if (opcode & 0xFC00) == 0x1000:
        K = (opcode & 0x0F) | ((opcode >> 4) & 0xF0)
        d = ((opcode >> 4) & 0x10) + 16
        return ('cpse', f"{get_register_name(d)}, {get_register_name(K)}", 2)

    if (opcode & 0xFC00) == 0x1400:
        K = (opcode & 0x0F) | ((opcode >> 4) & 0xF0)
        d = ((opcode >> 4) & 0x10) + 16
        return ('cp', f"{get_register_name(d)}, {get_register_name(K)}", 2)

    if (opcode & 0xFC00) == 0x1800:
        K = (opcode & 0x0F) | ((opcode >> 4) & 0xF0)
        d = ((opcode >> 4) & 0x10) + 16
        return ('sub', f"{get_register_name(d)}, {get_register_name(K)}", 2)

    if (opcode & 0xFC00) == 0x1C00:
        K = (opcode & 0x0F) | ((opcode >> 4) & 0xF0)
        d = ((opcode >> 4) & 0x10) + 16
        return ('adc', f"{get_register_name(d)}, {get_register_name(K)}", 2)

    if (opcode & 0xFC00) == 0x2000:
        K = (opcode & 0x0F) | ((opcode >> 4) & 0xF0)
        d = ((opcode >> 4) & 0x10) + 16
        return ('and', f"{get_register_name(d)}, {get_register_name(K)}", 2)

    if (opcode & 0xFC00) == 0x2400:
        K = (opcode & 0x0F) | ((opcode >> 4) & 0xF0)
        d = ((opcode >> 4) & 0x10) + 16
        return ('eor', f"{get_register_name(d)}, {get_register_name(K)}", 2)

    if (opcode & 0xFC00) == 0x2800:
        K = (opcode & 0x0F) | ((opcode >> 4) & 0xF0)
        d = ((opcode >> 4) & 0x10) + 16
        return ('or', f"{get_register_name(d)}, {get_register_name(K)}", 2)

    if (opcode & 0xF000) == 0x3000:
        K = (opcode & 0x0F) | ((opcode >> 4) & 0xF0)
        d = ((opcode >> 4) & 0x0F) + 16
        return ('cpi', f"{get_register_name(d)}, {K}", 2)

    if (opcode & 0xF000) == 0x4000:
        K = (opcode & 0x0F) | ((opcode >> 4) & 0xF0)
        d = ((opcode >> 4) & 0x0F) + 16
        return ('sbci', f"{get_register_name(d)}, {K}", 2)

    if (opcode & 0xF000) == 0x5000:
        K = (opcode & 0x0F) | ((opcode >> 4) & 0xF0)
        d = ((opcode >> 4) & 0x0F) + 16
        return ('subi', f"{get_register_name(d)}, {K}", 2)

    if (opcode & 0xF000) == 0x6000:
        K = (opcode & 0x0F) | ((opcode >> 4) & 0xF0)
        d = ((opcode >> 4) & 0x0F) + 16
        return ('ori', f"{get_register_name(d)}, {K}", 2)

    if (opcode & 0xF000) == 0x7000:
        K = (opcode & 0x0F) | ((opcode >> 4) & 0xF0)
        d = ((opcode >> 4) & 0x0F) + 16
        return ('andi', f"{get_register_name(d)}, {K}", 2)

    if (opcode & 0xF000) == 0xE000:
        K = (opcode & 0x0F) | ((opcode >> 4) & 0xF0)
        d = ((opcode >> 4) & 0x0F) + 16
        return ('ldi', f"{get_register_name(d)}, {K}", 2)

    if (opcode & 0xFF00) == 0x9600:
        d = (opcode >> 4) & 0x03
        reg_num = d * 2 + 24
        K = (opcode & 0x0F) | ((opcode >> 2) & 0x30)
        return ('adiw', f"{get_register_name(reg_num)}, {K}", 2)

    if (opcode & 0xFF00) == 0x9700:
        d = (opcode >> 4) & 0x03
        reg_num = d * 2 + 24
        K = (opcode & 0x0F) | ((opcode >> 2) & 0x30)
        return ('sbiw', f"{get_register_name(reg_num)}, {K}", 2)

    if (opcode & 0xFF00) == 0x9900:
        A = (opcode >> 3) & 0x1F
        b = opcode & 0x07
        return ('sbic', f"0x{A:02X}, {b}", 2)

    if (opcode & 0xFF00) == 0x9B00:
        A = (opcode >> 3) & 0x1F
        b = opcode & 0x07
        return ('sbis', f"0x{A:02X}, {b}", 2)

    if (opcode & 0xFF00) == 0x9800:
        A = (opcode >> 3) & 0x1F
        b = opcode & 0x07
        return ('cbi', f"0x{A:02X}, {b}", 2)

    if (opcode & 0xFF00) == 0x9A00:
        A = (opcode >> 3) & 0x1F
        b = opcode & 0x07
        return ('sbi', f"0x{A:02X}, {b}", 2)

    if (opcode & 0xFE00) == 0x9600:
        d = (opcode >> 4) & 0x1F
        return ('inc', f"{get_register_name(d)}", 2)

    if (opcode & 0xFE08) == 0x9408:
        d = (opcode >> 4) & 0x1F
        return ('dec', f"{get_register_name(d)}", 2)

    if (opcode & 0xFE08) == 0x9418:
        d = (opcode >> 4) & 0x1F
        return ('asr', f"{get_register_name(d)}", 2)

    if (opcode & 0xFE08) == 0x9428:
        d = (opcode >> 4) & 0x1F
        return ('com', f"{get_register_name(d)}", 2)

    if (opcode & 0xFE08) == 0x9438:
        d = (opcode >> 4) & 0x1F
        return ('neg', f"{get_register_name(d)}", 2)

    if (opcode & 0xFE08) == 0x9448:
        d = (opcode >> 4) & 0x1F
        return ('lsr', f"{get_register_name(d)}", 2)

    if (opcode & 0xFE08) == 0x9458:
        d = (opcode >> 4) & 0x1F
        return ('ror', f"{get_register_name(d)}", 2)

    if (opcode & 0xFE08) == 0x9468:
        d = (opcode >> 4) & 0x1F
        return ('swap', f"{get_register_name(d)}", 2)

    if (opcode & 0xFE08) == 0x9508:
        d = (opcode >> 4) & 0x1F
        return ('lsl', f"{get_register_name(d)}", 2)

    if (opcode & 0xFE08) == 0x9518:
        d = (opcode >> 4) & 0x1F
        return ('rol', f"{get_register_name(d)}", 2)

    if (opcode & 0xFE08) == 0x9538:
        d = (opcode >> 4) & 0x1F
        return ('tst', f"{get_register_name(d)}", 2)

    if (opcode & 0xFE08) == 0x9548:
        d = (opcode >> 4) & 0x1F
        return ('clr', f"{get_register_name(d)}", 2)

    if (opcode & 0xFE08) == 0x9558:
        d = (opcode >> 4) & 0x1F
        return ('ser', f"{get_register_name(d)}", 2)

    if (opcode & 0xFF00) == 0xF800:
        d = (opcode >> 4) & 0x1F
        b = opcode & 0x0F
        return ('bld', f"{get_register_name(d)}, {b}", 2)

    if (opcode & 0xFF00) == 0xFA00:
        d = (opcode >> 4) & 0x1F
        b = opcode & 0x0F
        return ('bld', f"{get_register_name(d)}, {b}", 2)

    if (opcode & 0xFF00) == 0xFC00:
        d = (opcode >> 4) & 0x1F
        b = opcode & 0x0F
        return ('bst', f"{get_register_name(d)}, {b}", 2)

    if (opcode & 0xFF00) == 0xFE00:
        d = (opcode >> 4) & 0x1F
        b = opcode & 0x0F
        return ('bst', f"{get_register_name(d)}, {b}", 2)

    if (opcode & 0xFF00) == 0x9700:
        d = (opcode >> 4) & 0x1F
        b = opcode & 0x0F
        return ('bld', f"{get_register_name(d)}, {b}", 2)

    if (opcode & 0xFF00) == 0x9F00:
        d = (opcode >> 4) & 0x1F
        b = opcode & 0x0F
        return ('bst', f"{get_register_name(d)}, {b}", 2)

    if (opcode & 0xFF00) == 0x9E00:
        A = opcode & 0xFF
        return ('mul', f"r0, r0", 2)

    if (opcode & 0xFE00) == 0x9C00:
        d = ((opcode >> 4) & 0x1F) | ((opcode >> 5) & 0x10)
        r = (opcode & 0x0F) | ((opcode >> 5) & 0x10)
        return ('mul', f"{get_register_name(d)}, {get_register_name(r)}", 2)

    if (opcode & 0xFE00) == 0x9E00:
        d = ((opcode >> 4) & 0x1F) | ((opcode >> 5) & 0x10)
        r = (opcode & 0x0F) | ((opcode >> 5) & 0x10)
        return ('muls', f"{get_register_name(d)}, {get_register_name(r)}", 2)

    if (opcode & 0xFF00) == 0x9300:
        r = (opcode >> 4) & 0x1F
        return ('mulsu', f"{get_register_name(r)}, {get_register_name(r)}", 2)

    if (opcode & 0xF800) == 0x9800:
        r = (opcode >> 4) & 0x1F
        q = opcode & 0x0F
        return ('std', f"Y+{q}, {get_register_name(r)}", 2)

    if (opcode & 0xF800) == 0x8800:
        d = (opcode >> 4) & 0x1F
        q = opcode & 0x0F
        return ('ldd', f"{get_register_name(d)}, Y+{q}", 2)

    if (opcode & 0xFC00) == 0xA800:
        r = (opcode >> 4) & 0x1F
        q = opcode & 0x0F
        return ('std', f"Z+{q}, {get_register_name(r)}", 2)

    if (opcode & 0xFC00) == 0x8000 and (opcode & 0x0C00) == 0x0800:
        d = (opcode >> 4) & 0x1F
        q = opcode & 0x0F
        return ('ldd', f"{get_register_name(d)}, Z+{q}", 2)

    if (opcode & 0xFF00) == 0xB000:
        d = (opcode >> 4) & 0x1F
        A = opcode & 0x0F
        return ('in', f"{get_register_name(d)}, 0x{A:02X}", 2)

    if (opcode & 0xFF00) == 0xB800:
        r = (opcode >> 4) & 0x1F
        A = opcode & 0x0F
        return ('out', f"0x{A:02X}, {get_register_name(r)}", 2)

    if (opcode & 0xF800) == 0xB800:
        r = (opcode >> 4) & 0x1F
        A = opcode & 0x3F
        return ('out', f"0x{A:02X}, {get_register_name(r)}", 2)

    if (opcode & 0xF800) == 0xB000:
        d = (opcode >> 4) & 0x1F
        A = opcode & 0x3F
        return ('in', f"{get_register_name(d)}, 0x{A:02X}", 2)

    if (opcode & 0xFF00) == 0x9000:
        d = (opcode >> 4) & 0x1F
        return ('lpm', f"{get_register_name(d)}, Z", 2)

    if (opcode & 0xFF00) == 0x9005:
        d = (opcode >> 4) & 0x1F
        return ('lpm', f"{get_register_name(d)}, Z+", 2)

    if (opcode & 0xFF00) == 0x9100:
        d = (opcode >> 4) & 0x1F
        return ('elpm', f"{get_register_name(d)}, Z", 2)

    if (opcode & 0xFF00) == 0x9105:
        d = (opcode >> 4) & 0x1F
        return ('elpm', f"{get_register_name(d)}, Z+", 2)

    if (opcode & 0xFC00) == 0x9000 and (opcode & 0x0F0F) == 0x0505:
        d = (opcode >> 4) & 0x1F
        return ('elpm', f"{get_register_name(d)}, Z+", 2)

    if (opcode & 0xF000) == 0xA000:
        r = (opcode >> 4) & 0x1F
        k = (opcode & 0x0F) | ((opcode & 0x0F00) >> 4)
        k = k | ((opcode & 0x0300) << 2)
        return ('lds', f"{get_register_name(r)}, 0x{k:02X}", 2)

    if (opcode & 0xFC00) == 0xA000:
        pass

    if opcode in AVR_INSTRUCTIONS:
        return AVR_INSTRUCTIONS[opcode]

    if (opcode & 0xFFFF) == 0:
        return ('nop', '', 2)

    return ('.word', f"0x{opcode:04X}", 2)
