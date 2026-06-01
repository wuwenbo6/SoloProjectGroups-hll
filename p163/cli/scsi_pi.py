#!/usr/bin/env python3
"""
SCSI T10 PI (Protection Information) CLI Tool
"""

import argparse
import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pi_engine import (
    PIContext, write_with_pi, read_with_pi, verify_file,
    inject_error, inject_errors_batch, get_dif_info,
    generate_report, SCSIPIError
)


def cmd_write(args):
    context = PIContext(
        app_tag=args.app_tag,
        ref_tag_mode=args.ref_mode,
        guard_type=args.guard_type
    )
    try:
        result = write_with_pi(args.input, args.output, context)
        print(json.dumps(result, indent=2))
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_read(args):
    context = PIContext(
        app_tag=args.app_tag,
        ref_tag_mode=args.ref_mode,
        guard_type=args.guard_type
    )
    try:
        result = read_with_pi(args.input, args.output, context, verify=not args.no_verify)
        print(json.dumps(result, indent=2))
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_verify(args):
    context = PIContext(
        app_tag=args.app_tag,
        ref_tag_mode=args.ref_mode,
        guard_type=args.guard_type
    )
    try:
        result = verify_file(args.input, context, collect_blocks=not args.brief)
        output = {
            'verification_passed': result['verification_passed'],
            'num_sectors': result['num_sectors'],
            'sectors_verified': result['sectors_verified'],
            'sectors_corrupted': result['sectors_corrupted'],
            'sectors_intact': result['sectors_intact'],
            'errors': result['errors'],
            'error_details': result['error_details'],
            'total_size': result['total_size'],
            'used_mmap': result['used_mmap']
        }
        if not args.brief:
            output['corrupted_blocks'] = result['corrupted_blocks']
            if args.include_intact:
                output['intact_blocks'] = result['verified_blocks']
        print(json.dumps(output, indent=2))
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_inject(args):
    try:
        flip_mask = int(args.flip_mask, 0) if args.flip_mask else None
        result = inject_error(
            args.input, args.output, args.sector,
            args.error_type, args.byte_offset, flip_mask
        )
        print(json.dumps(result, indent=2))
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_inject_batch(args):
    try:
        with open(args.spec_file, 'r') as f:
            error_specs = json.load(f)
        result = inject_errors_batch(args.input, args.output, error_specs)
        print(json.dumps(result, indent=2))
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_report(args):
    context = PIContext(
        app_tag=args.app_tag,
        ref_tag_mode=args.ref_mode,
        guard_type=args.guard_type
    )
    try:
        result = generate_report(
            args.input, context,
            output_file=args.output,
            include_intact=args.include_intact
        )
        if not args.output:
            print(json.dumps(result, indent=2, ensure_ascii=False))
        else:
            print(f"Report saved to: {args.output}")
            print(json.dumps({
                'verification_passed': result['verification_passed'],
                'total_sectors': result['total_sectors'],
                'sectors_corrupted': result['sectors_corrupted'],
                'sectors_intact': result['sectors_intact'],
                'total_errors': result['summary']['total_errors']
            }, indent=2))
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_info(args):
    try:
        result = get_dif_info(args.input, limit=args.limit)
        print(json.dumps(result, indent=2))
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def main():
    parser = argparse.ArgumentParser(description='SCSI T10 PI (Protection Information) Tool')
    subparsers = parser.add_subparsers(dest='command', help='Commands')

    write_parser = subparsers.add_parser('write', help='Write file with PI protection')
    write_parser.add_argument('input', help='Input file path')
    write_parser.add_argument('output', help='Output file path (with DIF)')
    write_parser.add_argument('--app-tag', type=lambda x: int(x, 0), default=0x0000, help='Application tag (default: 0x0000)')
    write_parser.add_argument('--ref-mode', choices=['lba', 'incremental', 'fixed'], default='lba', help='Reference tag mode')
    write_parser.add_argument('--guard-type', choices=['crc16'], default='crc16', help='Guard tag type')
    write_parser.set_defaults(func=cmd_write)

    read_parser = subparsers.add_parser('read', help='Read file with PI protection and extract data')
    read_parser.add_argument('input', help='Input file path (with DIF)')
    read_parser.add_argument('output', help='Output file path (extracted data)')
    read_parser.add_argument('--app-tag', type=lambda x: int(x, 0), default=0x0000, help='Application tag (default: 0x0000)')
    read_parser.add_argument('--ref-mode', choices=['lba', 'incremental', 'fixed'], default='lba', help='Reference tag mode')
    read_parser.add_argument('--guard-type', choices=['crc16'], default='crc16', help='Guard tag type')
    read_parser.add_argument('--no-verify', action='store_true', help='Skip verification')
    read_parser.set_defaults(func=cmd_read)

    verify_parser = subparsers.add_parser('verify', help='Verify file with PI protection')
    verify_parser.add_argument('input', help='Input file path (with DIF)')
    verify_parser.add_argument('--app-tag', type=lambda x: int(x, 0), default=0x0000, help='Application tag (default: 0x0000)')
    verify_parser.add_argument('--ref-mode', choices=['lba', 'incremental', 'fixed'], default='lba', help='Reference tag mode')
    verify_parser.add_argument('--guard-type', choices=['crc16'], default='crc16', help='Guard tag type')
    verify_parser.add_argument('--brief', action='store_true', help='Brief output (no block details)')
    verify_parser.add_argument('--include-intact', action='store_true', help='Include intact blocks in output')
    verify_parser.set_defaults(func=cmd_verify)

    inject_parser = subparsers.add_parser('inject', help='Inject single error into protected file')
    inject_parser.add_argument('input', help='Input file path (with DIF)')
    inject_parser.add_argument('output', help='Output file path (with error)')
    inject_parser.add_argument('--sector', type=int, default=0, help='Sector index to inject error')
    inject_parser.add_argument('--error-type', choices=['data', 'guard', 'ref', 'app'], default='data', help='Error type')
    inject_parser.add_argument('--byte-offset', type=int, default=0, help='Byte offset within the field (default: 0)')
    inject_parser.add_argument('--flip-mask', type=str, default='0xFF', help='XOR mask for byte flipping (default: 0xFF)')
    inject_parser.set_defaults(func=cmd_inject)

    inject_batch_parser = subparsers.add_parser('inject-batch', help='Inject multiple errors from JSON spec')
    inject_batch_parser.add_argument('input', help='Input file path (with DIF)')
    inject_batch_parser.add_argument('output', help='Output file path (with errors)')
    inject_batch_parser.add_argument('--spec-file', required=True, help='JSON file with error specifications')
    inject_batch_parser.set_defaults(func=cmd_inject_batch)

    report_parser = subparsers.add_parser('report', help='Generate detailed verification report')
    report_parser.add_argument('input', help='Input file path (with DIF)')
    report_parser.add_argument('--output', help='Output JSON report file (optional)')
    report_parser.add_argument('--app-tag', type=lambda x: int(x, 0), default=0x0000, help='Application tag (default: 0x0000)')
    report_parser.add_argument('--ref-mode', choices=['lba', 'incremental', 'fixed'], default='lba', help='Reference tag mode')
    report_parser.add_argument('--guard-type', choices=['crc16'], default='crc16', help='Guard tag type')
    report_parser.add_argument('--include-intact', action='store_true', help='Include intact blocks in report')
    report_parser.set_defaults(func=cmd_report)

    info_parser = subparsers.add_parser('info', help='Show DIF information of protected file')
    info_parser.add_argument('input', help='Input file path (with DIF)')
    info_parser.add_argument('--limit', type=int, default=None, help='Limit number of sectors to display')
    info_parser.set_defaults(func=cmd_info)

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 1

    return args.func(args)


if __name__ == '__main__':
    sys.exit(main())
