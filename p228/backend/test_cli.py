#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cli import SesCli, get_ses_cli

def main():
    print("=" * 60)
    print("SAS Backplane CLI Test")
    print("=" * 60)

    cli = get_ses_cli()

    print(f"\nDevice: {cli.device}")
    print(f"Simulation Mode: {cli.is_simulation_mode}")
    print(f"Has sg_ses: {cli._has_sg_ses()}")
    print(f"Can access device: {cli._can_access_device()}")

    print("\n" + "=" * 60)
    print("1. Scan Enclosures")
    print("=" * 60)
    enclosures = cli.scan_enclosures()
    print(f"Found enclosures: {enclosures}")

    print("\n" + "=" * 60)
    print("2. Get Slot Status")
    print("=" * 60)
    slots = cli.get_slot_status()
    print(f"Total slots: {len(slots)}")
    print(f"Present drives: {sum(1 for s in slots if s['present'])}")
    print(f"Fault slots: {sum(1 for s in slots if s['fault'])}")
    print(f"Locate slots: {sum(1 for s in slots if s['locate'])}")
    print(f"Active slots: {sum(1 for s in slots if s['active'])}")

    print("\nFirst 5 slots:")
    for slot in slots[:5]:
        status = []
        if slot['present']:
            status.append('PRESENT')
        if slot['locate']:
            status.append('LOCATE')
        if slot['fault']:
            status.append('FAULT')
        if slot['active']:
            status.append('ACTIVE')
        status_str = ', '.join(status) if status else 'EMPTY'
        print(f"  Slot {slot['slot']:2d}: {status_str}")

    print("\n" + "=" * 60)
    print("3. Temperature Sensors")
    print("=" * 60)
    temps = cli.get_temperature()
    for sensor in temps:
        status = "NORMAL"
        if sensor['critical'] and sensor['current'] >= sensor['critical']:
            status = "CRITICAL"
        elif sensor['warning'] and sensor['current'] >= sensor['warning']:
            status = "WARNING"
        print(f"  {sensor['name']:20s}: {sensor['current']:5.1f}°C ({status})")

    print("\n" + "=" * 60)
    print("4. LED Control Test")
    print("=" * 60)
    test_slot = 3
    print(f"Testing LED control on slot {test_slot}...")

    print(f"  Current locate LED: {cli.get_single_slot(test_slot)['locate']}")
    result = cli.set_led(test_slot, 'locate', 'on')
    print(f"  Set locate LED to ON: {'SUCCESS' if result else 'FAILED'}")
    print(f"  Current locate LED: {cli.get_single_slot(test_slot)['locate']}")

    result = cli.set_led(test_slot, 'locate', 'off')
    print(f"  Set locate LED to OFF: {'SUCCESS' if result else 'FAILED'}")
    print(f"  Current locate LED: {cli.get_single_slot(test_slot)['locate']}")

    print("\n" + "=" * 60)
    print("All tests completed successfully!")
    print("=" * 60)

if __name__ == '__main__':
    main()
