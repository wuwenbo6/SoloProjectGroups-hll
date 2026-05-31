#!/usr/bin/env python3
import argparse
import sys
import os
from typing import Optional

from .disassembler import AVRDisassembler
from .risk_analyzer import RiskAnalyzer
from .cfg_generator import CFGGenerator
from .string_extractor import StringExtractor
from .database import AnalysisDatabase
from .emulator import AVREmulator, TaintSource
from .ida_exporter import IDAExporter


def print_banner():
    banner = """
    ╔══════════════════════════════════════════════════════════════╗
    ║              AVR Firmware Analyzer v1.0                      ║
    ║        Atmega328 Binary Analysis & Reverse Engineering       ║
    ╚══════════════════════════════════════════════════════════════╝
    """
    print(banner)


def analyze_firmware(args):
    firmware_path = args.firmware
    if not os.path.exists(firmware_path):
        print(f"Error: File not found: {firmware_path}")
        sys.exit(1)

    print(f"\n[*] Analyzing firmware: {firmware_path}")
    print(f"[*] File size: {os.path.getsize(firmware_path)} bytes")
    print(f"[*] Base address: 0x{args.base_address:04X}")

    print("\n[1/5] Disassembling...")
    disassembler = AVRDisassembler(firmware_path, args.base_address)
    instructions = disassembler.disassemble_all()
    functions = disassembler.find_functions()
    print(f"    Found {len(instructions)} instructions")
    print(f"    Found {len(functions)} functions")

    print("\n[2/5] Extracting strings...")
    string_extractor = StringExtractor(disassembler.firmware_data, args.base_address)
    strings = string_extractor.extract_strings(min_length=args.min_string_length)
    print(f"    Found {len(strings)} strings")

    print("\n[3/5] Analyzing risks...")
    risk_analyzer = RiskAnalyzer(instructions, list(functions.values()))
    risk_result = risk_analyzer.analyze()
    print(f"    Found {risk_result.total_risks} risks")

    if args.no_db:
        print("\n[4/5] Skipping database storage (--no-db specified)")
        firmware_id = None
    else:
        print("\n[4/5] Storing results in database...")
        db_path = args.database if args.database else "avr_analysis.db"
        with AnalysisDatabase(db_path) as db:
            firmware_name = os.path.basename(firmware_path)
            firmware_id = db.store_analysis(
                firmware_name=firmware_name,
                firmware_path=firmware_path,
                firmware_size=os.path.getsize(firmware_path),
                base_addr=args.base_address,
                instructions=instructions,
                functions=functions,
                strings=strings,
                risk_result=risk_result
            )
        print(f"    Stored with ID: {firmware_id}")

    print("\n[5/5] Generating CFG...")
    cfg_generator = CFGGenerator(functions)
    cfgs = cfg_generator.generate_all()
    print(f"    Generated {len(cfgs)} control flow graphs")

    if args.output_cfg:
        os.makedirs(args.output_cfg, exist_ok=True)
        print(f"    Saving CFG images to: {args.output_cfg}")
        for func_name, cfg in cfgs.items():
            if len(cfg.basic_blocks) > 1:
                output_file = os.path.join(args.output_cfg, f"cfg_{func_name}")
                try:
                    cfg_generator.generate_dot(cfg, output_file)
                except Exception as e:
                    print(f"    Warning: Could not generate CFG for {func_name}: {e}")
        
        call_graph_file = os.path.join(args.output_cfg, "call_graph")
        try:
            cfg_generator.generate_call_graph(call_graph_file)
            print(f"    Generated call graph: {call_graph_file}.png")
        except Exception as e:
            print(f"    Warning: Could not generate call graph: {e}")

    print("\n" + "="*60)
    print("ANALYSIS COMPLETE")
    print("="*60)

    if args.disasm:
        print("\nDisassembly:")
        disassembler.print_disassembly(limit=args.disasm_limit)

    if args.functions:
        print("\nFunctions:")
        print_functions(functions)

    if args.strings:
        string_extractor.print_strings(limit=args.string_limit)

    if args.risks:
        risk_analyzer.print_report()

    return firmware_id


def print_functions(functions):
    print(f"\n{'='*60}")
    print(f"FUNCTIONS ({len(functions)} total)")
    print(f"{'='*60}")
    print(f"{'Name':<15} {'Start':<10} {'End':<10} {'Instr':<8} {'Calls'}")
    print(f"{'-'*60}")
    
    for addr in sorted(functions.keys()):
        func = functions[addr]
        calls = f"{len(func.calls)} calls" if func.calls else "-"
        print(f"{func.name:<15} 0x{func.start_addr:04X}    0x{func.end_addr:04X}    {len(func.instructions):<8} {calls}")


def cmd_list(args):
    db_path = args.database if args.database else "avr_analysis.db"
    with AnalysisDatabase(db_path) as db:
        firmware_list = db.get_firmware_list()
        
        if not firmware_list:
            print("No firmware analyses found in database.")
            return
        
        print(f"\n{'='*80}")
        print(f"STORED FIRMWARE ANALYSES ({len(firmware_list)})")
        print(f"{'='*80}")
        print(f"{'ID':<5} {'Name':<30} {'Size':<10} {'Analyzed At'}")
        print(f"{'-'*80}")
        
        for fw in firmware_list:
            print(f"{fw['id']:<5} {fw['name'][:28]:<30} {fw['size']:<10} {fw['analyzed_at']}")


def cmd_show(args):
    db_path = args.database if args.database else "avr_analysis.db"
    with AnalysisDatabase(db_path) as db:
        summary = db.get_analysis_summary(args.id)
        
        if not summary:
            print(f"No analysis found with ID {args.id}")
            return
        
        firmware = db.get_firmware_by_id(args.id)
        
        print(f"\n{'='*60}")
        print(f"ANALYSIS SUMMARY - ID: {args.id}")
        print(f"{'='*60}")
        print(f"Firmware:     {firmware['name']}")
        print(f"Path:         {firmware['path']}")
        print(f"Size:         {firmware['size']} bytes")
        print(f"Base Addr:    0x{firmware['base_address']:04X}")
        print(f"Analyzed:     {firmware['analyzed_at']}")
        print(f"\nStatistics:")
        print(f"  Instructions: {summary['total_instructions']}")
        print(f"  Functions:    {summary['total_functions']}")
        print(f"  Strings:      {summary['total_strings']}")
        print(f"  Total Risks:  {summary['total_risks']}")
        print(f"    Critical:   {summary['critical_risks']}")
        print(f"    High:       {summary['high_risks']}")
        print(f"    Medium:     {summary['medium_risks']}")
        print(f"    Low:        {summary['low_risks']}")


def cmd_functions(args):
    db_path = args.database if args.database else "avr_analysis.db"
    with AnalysisDatabase(db_path) as db:
        functions = db.get_functions(args.id)
        
        if not functions:
            print(f"No functions found for firmware ID {args.id}")
            return
        
        print(f"\n{'='*70}")
        print(f"FUNCTIONS ({len(functions)})")
        print(f"{'='*70}")
        print(f"{'Name':<15} {'Start':<10} {'End':<10} {'Instr':<8}")
        print(f"{'-'*70}")
        
        for func in functions:
            print(f"{func['name']:<15} 0x{func['start_address']:04X}    "
                  f"0x{func['end_address']:04X}    {func['instruction_count']:<8}")


def cmd_strings(args):
    db_path = args.database if args.database else "avr_analysis.db"
    with AnalysisDatabase(db_path) as db:
        strings = db.get_strings(args.id, args.search)
        
        if not strings:
            print(f"No strings found for firmware ID {args.id}")
            return
        
        print(f"\n{'='*70}")
        print(f"STRINGS ({len(strings)})")
        print(f"{'='*70}")
        print(f"{'Address':<10} {'Len':<5} {'Encoding':<15} {'Value'}")
        print(f"{'-'*70}")
        
        for s in strings[:args.limit]:
            display_value = s['value'] if len(s['value']) < 50 else s['value'][:47] + "..."
            print(f"0x{s['address']:04X}    {s['length']:<5} {s['encoding']:<15} {display_value}")


def cmd_risks(args):
    db_path = args.database if args.database else "avr_analysis.db"
    with AnalysisDatabase(db_path) as db:
        risks = db.get_risks(args.id, args.level)
        
        if not risks:
            print(f"No risks found for firmware ID {args.id}")
            return
        
        level_colors = {
            'critical': '\033[91m',
            'high': '\033[93m',
            'medium': '\033[94m',
            'low': '\033[92m'
        }
        reset = '\033[0m'
        
        print(f"\n{'='*70}")
        print(f"RISKS ({len(risks)})")
        print(f"{'='*70}")
        
        for i, risk in enumerate(risks, 1):
            color = level_colors.get(risk['level'], '')
            print(f"\n[{i}] {color}{risk['name']}{reset}")
            print(f"    Level: {risk['level'].upper()}")
            print(f"    Description: {risk['description']}")
            print(f"    Addresses: {risk['addresses']}")


def cmd_disasm(args):
    db_path = args.database if args.database else "avr_analysis.db"
    with AnalysisDatabase(db_path) as db:
        start_addr = int(args.start, 16) if args.start.startswith('0x') else int(args.start)
        instructions = db.get_instructions(args.id, start_addr=start_addr, limit=args.limit)
        
        if not instructions:
            print(f"No instructions found for firmware ID {args.id}")
            return
        
        print(f"\n{'='*60}")
        print(f"DISASSEMBLY")
        print(f"{'='*60}")
        print(f"{'Address':<10} {'Bytes':<12} {'Instruction'}")
        print(f"{'-'*60}")
        
        for insn in instructions:
            bytes_hex = insn['bytes'].hex() if insn['bytes'] else ''
            print(f"0x{insn['address']:04X}    {bytes_hex:<12} {insn['mnemonic']:<8} {insn['op_str']}")


def cmd_export(args):
    db_path = args.database if args.database else "avr_analysis.db"
    with AnalysisDatabase(db_path) as db:
        strings = db.get_strings(args.id)
        
        if not strings:
            print(f"No strings found for firmware ID {args.id}")
            return
        
        output_file = args.output
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("Address,Length,Encoding,Value\n")
            for s in strings:
                escaped_value = s['value'].replace('"', '""')
                f.write(f"0x{s['address']:04X},{s['length']},{s['encoding']},\"{escaped_value}\"\n")
        
        print(f"Exported {len(strings)} strings to {output_file}")


def cmd_emulate(args):
    firmware_path = args.firmware
    if not os.path.exists(firmware_path):
        print(f"Error: File not found: {firmware_path}")
        sys.exit(1)

    print(f"\n[*] Starting emulation of: {firmware_path}")
    print(f"[*] Base address: 0x{args.base_address:04X}")
    
    with open(firmware_path, 'rb') as f:
        firmware_data = f.read()
    
    emulator = AVREmulator(firmware_data, args.base_address)
    
    if args.max_steps:
        emulator.set_max_instructions(args.max_steps)
    
    start_addr = args.start if args.start else args.base_address
    print(f"[*] Starting PC: 0x{start_addr:04X}")
    print(f"[*] Max steps: {emulator.max_instructions}")
    
    if args.breakpoint:
        for bp in args.breakpoint:
            bp_addr = int(bp, 16) if bp.startswith('0x') else int(bp)
            emulator.add_breakpoint(bp_addr)
            print(f"[*] Added breakpoint at 0x{bp_addr:04X}")
    
    print("\n[*] Running emulation...")
    result = emulator.run(start_addr=start_addr)
    
    print(f"\n{'='*60}")
    print("EMULATION RESULT")
    print(f"{'='*60}")
    print(f"Success:          {result.success}")
    if result.error:
        print(f"Error:            {result.error}")
    print(f"Instructions:     {result.instructions_executed}")
    print(f"Final PC:         0x{result.final_pc:04X}")
    print(f"Final SP:         0x{result.final_registers.sp:04X}")
    print(f"Final SREG:       0x{result.final_registers.sreg:02X}")
    print(f"Memory accesses:  {len(result.memory_accesses)}")
    print(f"Branch decisions: {len(result.branch_decisions)}")
    print(f"Function calls:   {len(result.function_calls)}")
    
    if args.registers:
        print(f"\n{'='*60}")
        print("REGISTER DUMP")
        print(f"{'='*60}")
        for i in range(0, 32, 4):
            regs = []
            for j in range(4):
                if i + j < 32:
                    val = result.final_registers.r[i + j]
                    regs.append(f"r{i+j:2d}: 0x{val:02X}")
            print("  ".join(regs))
        
        print(f"\nX: 0x{result.final_registers.x:04X}  "
              f"Y: 0x{result.final_registers.y:04X}  "
              f"Z: 0x{result.final_registers.z:04X}")
    
    if args.trace:
        print(f"\n{'='*60}")
        print("EXECUTION TRACE (last 50 instructions)")
        print(f"{'='*60}")
        trace = result.execution_trace[-50:]
        for i, addr in enumerate(trace):
            print(f"  {i:3d}: 0x{addr:04X}")
    
    if args.calls:
        print(f"\n{'='*60}")
        print("FUNCTION CALLS")
        print(f"{'='*60}")
        for i, call_addr in enumerate(result.function_calls[:20]):
            print(f"  [{i:2d}] 0x{call_addr:04X}")
        if len(result.function_calls) > 20:
            print(f"  ... and {len(result.function_calls) - 20} more")


def cmd_taint(args):
    firmware_path = args.firmware
    if not os.path.exists(firmware_path):
        print(f"Error: File not found: {firmware_path}")
        sys.exit(1)

    print(f"\n[*] Starting dynamic taint analysis")
    print(f"[*] Firmware: {firmware_path}")
    
    with open(firmware_path, 'rb') as f:
        firmware_data = f.read()
    
    emulator = AVREmulator(firmware_data, args.base_address)
    
    if args.max_steps:
        emulator.set_max_instructions(args.max_steps)
    
    if args.taint_register:
        for reg_str in args.taint_register:
            reg_num = int(reg_str)
            emulator.taint_register(reg_num, TaintSource.USER)
            print(f"[*] Tainted register r{reg_num}")
    
    if args.taint_memory:
        for mem_str in args.taint_memory:
            mem_addr = int(mem_str, 16) if mem_str.startswith('0x') else int(mem_str)
            emulator.taint_memory(mem_addr, TaintSource.USER)
            print(f"[*] Tainted memory at 0x{mem_addr:04X}")
    
    start_addr = args.start if args.start else args.base_address
    print(f"\n[*] Running taint analysis from 0x{start_addr:04X}...")
    result = emulator.run(start_addr=start_addr)
    
    print(f"\n{'='*60}")
    print("TAINT ANALYSIS RESULT")
    print(f"{'='*60}")
    print(f"Success:          {result.success}")
    if result.error:
        print(f"Error:            {result.error}")
    print(f"Instructions:     {result.instructions_executed}")
    print(f"Tainted registers: {len(result.tainted_registers)}")
    print(f"Tainted memory:   {len(result.tainted_memory)}")
    
    print("\n[*] Detailed taint report:")
    emulator.print_taint_report()


def cmd_export_ida(args):
    firmware_path = args.firmware
    if not os.path.exists(firmware_path):
        print(f"Error: File not found: {firmware_path}")
        sys.exit(1)

    print(f"\n[*] Exporting IDA script for: {firmware_path}")
    
    print("\n[1/4] Disassembling...")
    disassembler = AVRDisassembler(firmware_path, args.base_address)
    instructions = disassembler.disassemble_all()
    functions = disassembler.find_functions()
    print(f"    Found {len(instructions)} instructions")
    print(f"    Found {len(functions)} functions")

    print("\n[2/4] Extracting strings...")
    string_extractor = StringExtractor(disassembler.firmware_data, args.base_address)
    strings = string_extractor.extract_strings(min_length=4)
    print(f"    Found {len(strings)} strings")

    print("\n[3/4] Analyzing risks...")
    risk_analyzer = RiskAnalyzer(instructions, list(functions.values()))
    risk_result = risk_analyzer.analyze()
    print(f"    Found {risk_result.total_risks} risks")
    
    print("\n[4/4] Generating IDA script...")
    firmware_name = os.path.basename(firmware_path)
    exporter = IDAExporter(firmware_name)
    
    output_file = args.output
    if args.idc:
        exporter.export_idc_script(
            output_file,
            functions=list(functions.values()),
            strings=strings,
            risks=risk_result.patterns
        )
        print(f"    Generated IDC script: {output_file}")
    else:
        exporter.export_script(
            output_file,
            functions=list(functions.values()),
            instructions=instructions,
            strings=strings,
            risks=risk_result.patterns
        )
        print(f"    Generated Python script: {output_file}")
    
    print(f"\n{'='*60}")
    print("EXPORT COMPLETE")
    print(f"{'='*60}")
    print(f"Output file: {output_file}")
    print(f"Script type: {'IDC' if args.idc else 'IDAPython'}")
    print(f"Functions:   {len(functions)}")
    print(f"Strings:     {len(strings)}")
    print(f"Risks:       {risk_result.total_risks}")


def main():
    parser = argparse.ArgumentParser(
        description="AVR Firmware Analyzer - Analyze Atmega328 binary firmware",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    analyze_parser = subparsers.add_parser('analyze', help='Analyze a firmware binary')
    analyze_parser.add_argument('firmware', help='Path to firmware binary file')
    analyze_parser.add_argument('-b', '--base-address', type=lambda x: int(x, 0), 
                               default=0x0000, help='Base address (default: 0x0000)')
    analyze_parser.add_argument('--disasm', action='store_true', help='Show disassembly')
    analyze_parser.add_argument('--disasm-limit', type=int, default=50, 
                               help='Limit disassembly output lines')
    analyze_parser.add_argument('--functions', action='store_true', help='Show functions')
    analyze_parser.add_argument('--strings', action='store_true', help='Show strings')
    analyze_parser.add_argument('--string-limit', type=int, default=30, 
                               help='Limit strings output lines')
    analyze_parser.add_argument('--min-string-length', type=int, default=4, 
                               help='Minimum string length to extract')
    analyze_parser.add_argument('--risks', action='store_true', help='Show risk analysis')
    analyze_parser.add_argument('--output-cfg', metavar='DIR', 
                               help='Output directory for CFG images')
    analyze_parser.add_argument('--no-db', action='store_true', 
                               help='Do not store results in database')
    analyze_parser.add_argument('-d', '--database', help='Database path')
    analyze_parser.set_defaults(func=analyze_firmware)
    
    list_parser = subparsers.add_parser('list', help='List stored analyses')
    list_parser.add_argument('-d', '--database', help='Database path')
    list_parser.set_defaults(func=cmd_list)
    
    show_parser = subparsers.add_parser('show', help='Show analysis summary')
    show_parser.add_argument('id', type=int, help='Firmware ID')
    show_parser.add_argument('-d', '--database', help='Database path')
    show_parser.set_defaults(func=cmd_show)
    
    func_parser = subparsers.add_parser('functions', help='List functions')
    func_parser.add_argument('id', type=int, help='Firmware ID')
    func_parser.add_argument('-d', '--database', help='Database path')
    func_parser.set_defaults(func=cmd_functions)
    
    str_parser = subparsers.add_parser('strings', help='List strings')
    str_parser.add_argument('id', type=int, help='Firmware ID')
    str_parser.add_argument('-s', '--search', help='Search keyword')
    str_parser.add_argument('-l', '--limit', type=int, default=100, help='Limit results')
    str_parser.add_argument('-d', '--database', help='Database path')
    str_parser.set_defaults(func=cmd_strings)
    
    risk_parser = subparsers.add_parser('risks', help='List risks')
    risk_parser.add_argument('id', type=int, help='Firmware ID')
    risk_parser.add_argument('-l', '--level', choices=['critical', 'high', 'medium', 'low'],
                            help='Filter by risk level')
    risk_parser.add_argument('-d', '--database', help='Database path')
    risk_parser.set_defaults(func=cmd_risks)
    
    disasm_parser = subparsers.add_parser('disasm', help='Show disassembly')
    disasm_parser.add_argument('id', type=int, help='Firmware ID')
    disasm_parser.add_argument('-s', '--start', default='0x0000', help='Start address')
    disasm_parser.add_argument('-l', '--limit', type=int, default=100, help='Limit results')
    disasm_parser.add_argument('-d', '--database', help='Database path')
    disasm_parser.set_defaults(func=cmd_disasm)
    
    export_parser = subparsers.add_parser('export', help='Export strings to CSV')
    export_parser.add_argument('id', type=int, help='Firmware ID')
    export_parser.add_argument('-o', '--output', required=True, help='Output file')
    export_parser.add_argument('-d', '--database', help='Database path')
    export_parser.set_defaults(func=cmd_export)
    
    emulate_parser = subparsers.add_parser('emulate', help='Emulate firmware execution')
    emulate_parser.add_argument('firmware', help='Path to firmware binary file')
    emulate_parser.add_argument('-b', '--base-address', type=lambda x: int(x, 0), 
                               default=0x0000, help='Base address (default: 0x0000)')
    emulate_parser.add_argument('-s', '--start', type=lambda x: int(x, 0), 
                               help='Start address (default: base address)')
    emulate_parser.add_argument('-m', '--max-steps', type=int, help='Maximum instructions to execute')
    emulate_parser.add_argument('-r', '--registers', action='store_true', help='Show register dump')
    emulate_parser.add_argument('-t', '--trace', action='store_true', help='Show execution trace')
    emulate_parser.add_argument('-c', '--calls', action='store_true', help='Show function calls')
    emulate_parser.add_argument('--breakpoint', action='append', metavar='ADDR', 
                                help='Add breakpoint at address')
    emulate_parser.set_defaults(func=cmd_emulate)
    
    taint_parser = subparsers.add_parser('taint', help='Dynamic taint analysis')
    taint_parser.add_argument('firmware', help='Path to firmware binary file')
    taint_parser.add_argument('-b', '--base-address', type=lambda x: int(x, 0), 
                             default=0x0000, help='Base address (default: 0x0000)')
    taint_parser.add_argument('-s', '--start', type=lambda x: int(x, 0), 
                             help='Start address (default: base address)')
    taint_parser.add_argument('-m', '--max-steps', type=int, help='Maximum instructions to execute')
    taint_parser.add_argument('--taint-register', action='append', metavar='REG',
                              help='Taint register (e.g., --taint-register 0)')
    taint_parser.add_argument('--taint-memory', action='append', metavar='ADDR',
                              help='Taint memory address (e.g., --taint-memory 0x100)')
    taint_parser.set_defaults(func=cmd_taint)
    
    ida_parser = subparsers.add_parser('export-ida', help='Export IDA script')
    ida_parser.add_argument('firmware', help='Path to firmware binary file')
    ida_parser.add_argument('-o', '--output', required=True, help='Output script file')
    ida_parser.add_argument('-b', '--base-address', type=lambda x: int(x, 0), 
                           default=0x0000, help='Base address (default: 0x0000)')
    ida_parser.add_argument('--idc', action='store_true', help='Export IDC script instead of IDAPython')
    ida_parser.set_defaults(func=cmd_export_ida)
    
    if len(sys.argv) == 1:
        print_banner()
        parser.print_help()
        sys.exit(0)
    
    args = parser.parse_args()
    
    if args.command:
        print_banner()
        args.func(args)


if __name__ == '__main__':
    main()
