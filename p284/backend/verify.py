from gmr_parser import GMRParser, GMRConstants
from test_data_generator import TestDataGenerator

print('=== GMR Frame Parser System - Quick Verification ===')
print('')

print('GMR Frame Structure Parameters:')
print('  Superframe size:', GMRConstants.SUPERFRAME_SIZE, 'bits')
print('  Multiframe size:', GMRConstants.MULTIFRAME_SIZE, 'bits')
print('  Basic frame size:', GMRConstants.BASIC_FRAME_SIZE, 'bits')
print('  Superframe contains:', GMRConstants.SUPERFRAME_MULTIFRAMES, 'multiframes')
print('  Multiframe contains:', GMRConstants.MULTIFRAME_BASIC_FRAMES, 'basic frames')
print('  Basic frame contains:', GMRConstants.BASIC_FRAME_TIMESLOTS, 'timeslots')
print('')

parser = GMRParser()
generator = TestDataGenerator()

print('Generating test data...')
sf_data = generator.generate_superframe(occupancy_rate=0.6, error_rate=0.01)
print('Generated superframe size:', len(sf_data), 'bits')
print('')

print('Parsing superframe...')
sf = parser.parse_bitarray(sf_data)
print('Superframe number:', sf.frame_number)
print('Sync status:', sf.sync_status)
print('Multiframe count:', len(sf.multiframes))
print('')

status = parser.get_sync_status()
print('Superframe sync status:', status['superframe_status'])
locked = sum(1 for mf in status['multiframe_statuses'] if mf['status'] == 'locked')
print('Locked multiframes:', locked, '/', len(status['multiframe_statuses']))
print('')

bch_codes = parser.extract_bch_codes()
print('Extracted BCH codes:', len(bch_codes))
valid_bch = sum(1 for bch in bch_codes if bch['valid'])
print('Valid BCH codes:', valid_bch, '(', valid_bch/len(bch_codes)*100, '%)')
print('')

traffic_slots = parser.extract_traffic_timeslots()
print('Traffic timeslots:', len(traffic_slots))
print('')

print('=== Verification Complete ===')
print('')
print('System is ready. You can start the Flask server.')
print('Command: cd backend && source venv/bin/activate && python app.py')
print('Then open frontend/index.html in your browser.')
