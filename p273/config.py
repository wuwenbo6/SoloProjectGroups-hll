METER_ID = 1
RATE_THRESHOLD = 1000000
BURST_SIZE = 100000
DSCP_REMARK_VALUE = 0
BURST_TOLERANCE_RATE = 500000
BURST_TOLERANCE_BURST = 200000
MONITOR_INTERVAL = 1.0
WEBSOCKET_PORT = 8765
WEB_PORT = 5000
OFPP_CONTROLLER = 0xfffffffd
OFPVID_PRESENT = 0x0000

DSCP_MAP = {
    0: 'BE (Default)',
    8: 'CS1',
    10: 'AF11',
    12: 'AF12',
    14: 'AF13',
    16: 'CS2',
    18: 'AF21',
    20: 'AF22',
    22: 'AF23',
    24: 'CS3',
    26: 'AF31',
    28: 'AF32',
    30: 'AF33',
    32: 'CS4',
    34: 'AF41',
    36: 'AF42',
    38: 'AF43',
    40: 'CS5',
    46: 'EF',
    48: 'CS6',
    56: 'CS7'
}

METER_CHAIN = [
    {
        'meter_id': 1,
        'table_id': 0,
        'name': 'Level-1 Remark',
        'bands': [
            {'type': 'remark', 'rate': 500, 'burst_size': 100, 'prec_level': 10},
        ],
        'goto_table': 1,
    },
    {
        'meter_id': 2,
        'table_id': 1,
        'name': 'Level-2 Remark',
        'bands': [
            {'type': 'remark', 'rate': 1000, 'burst_size': 100, 'prec_level': 0},
        ],
        'goto_table': 2,
    },
    {
        'meter_id': 3,
        'table_id': 2,
        'name': 'Level-3 Drop',
        'bands': [
            {'type': 'drop', 'rate': 1500, 'burst_size': 200},
        ],
        'goto_table': None,
    },
]

EXPORT_TIMESTAMP_FORMAT = '%Y%m%d_%H%M%S'
