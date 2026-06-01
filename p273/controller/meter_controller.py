from ryu.base import app_manager
from ryu.controller import ofp_event
from ryu.controller.handler import CONFIG_DISPATCHER, MAIN_DISPATCHER
from ryu.controller.handler import set_ev_cls
from ryu.ofproto import ofproto_v1_3
from ryu.lib.packet import packet
from ryu.lib.packet import ethernet
from ryu.lib.packet import ipv4
from ryu.lib import hub
import config
import time
import copy
from collections import defaultdict


class MeterController(app_manager.RyuApp):
    OFP_VERSIONS = [ofproto_v1_3.OFP_VERSION]

    def __init__(self, *args, **kwargs):
        super(MeterController, self).__init__(*args, **kwargs)
        self.mac_to_port = {}
        self.datapath = None
        self.monitor_thread = None
        self.meter_chain = copy.deepcopy(config.METER_CHAIN)
        self.flow_stats = defaultdict(lambda: {
            'byte_count': 0,
            'packet_count': 0,
            'last_byte_count': 0,
            'last_packet_count': 0,
            'last_update': time.time(),
            'rate_bps': 0,
        })
        self.meter_stats = {}
        for meter_cfg in self.meter_chain:
            mid = meter_cfg['meter_id']
            self.meter_stats[mid] = {
                'meter_id': mid,
                'name': meter_cfg['name'],
                'bands': meter_cfg['bands'],
                'band_stats': [],
                'remarked_packets': 0,
                'remarked_bytes': 0,
                'dropped_packets': 0,
                'dropped_bytes': 0,
            }
        self.raw_flow_entries = []
        self.data_callback = None

    def set_data_callback(self, callback):
        self.data_callback = callback

    @set_ev_cls(ofp_event.EventOFPSwitchFeatures, CONFIG_DISPATCHER)
    def switch_features_handler(self, ev):
        datapath = ev.msg.datapath
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser
        self.datapath = datapath

        self.logger.info("Switch connected: dpid=%s", datapath.id)

        self._install_table_miss_flows(datapath)
        self._install_meter_chain(datapath)
        self._install_chain_flows(datapath)

        if self.monitor_thread is None:
            self.monitor_thread = hub.spawn(self._monitor_loop)

    def _install_table_miss_flows(self, datapath):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser
        table_ids = set()
        for meter_cfg in self.meter_chain:
            table_ids.add(meter_cfg['table_id'])
            if meter_cfg.get('goto_table') is not None:
                table_ids.add(meter_cfg['goto_table'])
        for table_id in sorted(table_ids):
            match = parser.OFPMatch()
            actions = [parser.OFPActionOutput(ofproto.OFPP_CONTROLLER,
                                              ofproto.OFPCML_NO_BUFFER)]
            inst = [parser.OFPInstructionActions(ofproto.OFPIT_APPLY_ACTIONS, actions)]
            mod = parser.OFPFlowMod(
                datapath=datapath, table_id=table_id,
                priority=0, match=match, instructions=inst
            )
            datapath.send_msg(mod)
            self.logger.info("Table-miss flow installed: table_id=%d", table_id)

    def _install_meter_chain(self, datapath):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        for meter_cfg in self.meter_chain:
            bands = []
            for band_cfg in meter_cfg['bands']:
                band = self._create_band(parser, band_cfg)
                bands.append(band)

            mod = parser.OFPMeterMod(
                datapath=datapath,
                command=ofproto.OFPMC_ADD,
                flags=ofproto.OFPMF_KBPS,
                meter_id=meter_cfg['meter_id'],
                bands=bands
            )
            datapath.send_msg(mod)

            self.logger.info(
                "Meter installed: meter_id=%d, name=%s, table=%d, bands=%d",
                meter_cfg['meter_id'], meter_cfg['name'],
                meter_cfg['table_id'], len(bands)
            )
            for idx, band_cfg in enumerate(meter_cfg['bands']):
                btype = band_cfg['type'].upper()
                rate = band_cfg['rate']
                if band_cfg['type'] == 'remark':
                    dscp = band_cfg.get('prec_level', 0)
                    dscp_name = config.DSCP_MAP.get(dscp, 'Unknown')
                    self.logger.info(
                        "  Band %d (%s): rate=%d kbps, DSCP->%d (%s)",
                        idx, btype, rate, dscp, dscp_name
                    )
                else:
                    self.logger.info(
                        "  Band %d (%s): rate=%d kbps",
                        idx, btype, rate
                    )

    def _create_band(self, parser, band_cfg):
        if band_cfg['type'] == 'remark':
            return parser.OFPMeterBandRemark(
                rate=band_cfg['rate'],
                burst_size=band_cfg.get('burst_size', 0),
                prec_level=band_cfg.get('prec_level', 0)
            )
        elif band_cfg['type'] == 'drop':
            return parser.OFPMeterBandDrop(
                rate=band_cfg['rate'],
                burst_size=band_cfg.get('burst_size', 0)
            )
        else:
            return parser.OFPMeterBandDrop(
                rate=band_cfg['rate'],
                burst_size=band_cfg.get('burst_size', 0)
            )

    def _install_chain_flows(self, datapath):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        for i, meter_cfg in enumerate(self.meter_chain):
            match = parser.OFPMatch(eth_type=0x0800)
            instructions = [
                parser.OFPInstructionMeter(
                    meter_id=meter_cfg['meter_id'],
                    type_=ofproto.OFPIT_METER
                )
            ]

            goto_table = meter_cfg.get('goto_table')
            if goto_table is not None:
                instructions.append(
                    parser.OFPInstructionGotoTable(goto_table)
                )
            else:
                instructions.append(
                    parser.OFPInstructionActions(
                        ofproto.OFPIT_APPLY_ACTIONS,
                        [parser.OFPActionOutput(ofproto.OFPP_FLOOD)]
                    )
                )

            mod = parser.OFPFlowMod(
                datapath=datapath,
                table_id=meter_cfg['table_id'],
                priority=10,
                match=match,
                instructions=instructions
            )
            datapath.send_msg(mod)

            next_info = f"-> table {goto_table}" if goto_table is not None else "-> OUTPUT"
            self.logger.info(
                "Chain flow installed: table=%d, meter=%d %s",
                meter_cfg['table_id'], meter_cfg['meter_id'], next_info
            )

    def _add_flow(self, datapath, priority, match, actions, buffer_id=None,
                  instructions=None, table_id=0):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        if instructions is None:
            instructions = [
                parser.OFPInstructionActions(ofproto.OFPIT_APPLY_ACTIONS, actions)
            ]

        if buffer_id:
            mod = parser.OFPFlowMod(
                datapath=datapath, buffer_id=buffer_id,
                priority=priority, match=match,
                instructions=instructions, table_id=table_id
            )
        else:
            mod = parser.OFPFlowMod(
                datapath=datapath, priority=priority,
                match=match, instructions=instructions, table_id=table_id
            )
        datapath.send_msg(mod)

    @set_ev_cls(ofp_event.EventOFPPacketIn, MAIN_DISPATCHER)
    def _packet_in_handler(self, ev):
        msg = ev.msg
        datapath = msg.datapath
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser
        in_port = msg.match['in_port']

        pkt = packet.Packet(msg.data)
        eth = pkt.get_protocols(ethernet.ethernet)[0]

        dst = eth.dst
        src = eth.src

        dpid = datapath.id
        self.mac_to_port.setdefault(dpid, {})

        self.mac_to_port[dpid][src] = in_port

        if dst in self.mac_to_port[dpid]:
            out_port = self.mac_to_port[dpid][dst]
        else:
            out_port = ofproto.OFPP_FLOOD

        actions = [parser.OFPActionOutput(out_port)]

        if out_port != ofproto.OFPP_FLOOD:
            match = parser.OFPMatch(
                in_port=in_port, eth_dst=dst, eth_src=src
            )
            if msg.buffer_id != ofproto.OFP_NO_BUFFER:
                self._add_flow(datapath, 1, match, actions, msg.buffer_id)
                return
            else:
                self._add_flow(datapath, 1, match, actions)

        data = None
        if msg.buffer_id == ofproto.OFP_NO_BUFFER:
            data = msg.data

        out = parser.OFPPacketOut(
            datapath=datapath, buffer_id=msg.buffer_id,
            in_port=in_port, actions=actions, data=data
        )
        datapath.send_msg(out)

    def _monitor_loop(self):
        while True:
            if self.datapath:
                self._request_flow_stats(self.datapath)
                self._request_meter_stats(self.datapath)
            hub.sleep(config.MONITOR_INTERVAL)

    def _request_flow_stats(self, datapath):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        table_ids = set()
        for meter_cfg in self.meter_chain:
            table_ids.add(meter_cfg['table_id'])

        for table_id in sorted(table_ids):
            req = parser.OFPFlowStatsRequest(datapath, table_id=table_id)
            datapath.send_msg(req)

    def _request_meter_stats(self, datapath):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        for meter_cfg in self.meter_chain:
            req = parser.OFPMeterStatsRequest(
                datapath, meter_id=meter_cfg['meter_id']
            )
            datapath.send_msg(req)

    @set_ev_cls(ofp_event.EventOFPFlowStatsReply, MAIN_DISPATCHER)
    def _flow_stats_reply_handler(self, ev):
        body = ev.msg.body
        current_time = time.time()
        self.raw_flow_entries = []

        for stat in body:
            flow_key = self._get_flow_key(stat)
            flow_stat = self.flow_stats[flow_key]

            byte_diff = stat.byte_count - flow_stat['last_byte_count']
            packet_diff = stat.packet_count - flow_stat['last_packet_count']
            time_diff = current_time - flow_stat['last_update']

            if time_diff > 0:
                flow_stat['rate_bps'] = (byte_diff * 8) / time_diff

            flow_stat['byte_count'] = stat.byte_count
            flow_stat['packet_count'] = stat.packet_count
            flow_stat['last_byte_count'] = stat.byte_count
            flow_stat['last_packet_count'] = stat.packet_count
            flow_stat['last_update'] = current_time

            self.raw_flow_entries.append({
                'table_id': stat.table_id,
                'priority': stat.priority,
                'match': str(stat.match),
                'duration_sec': stat.duration_sec,
                'duration_nsec': stat.duration_nsec,
                'idle_timeout': stat.idle_timeout,
                'hard_timeout': stat.hard_timeout,
                'cookie': stat.cookie,
                'packet_count': stat.packet_count,
                'byte_count': stat.byte_count,
                'instructions': [str(inst) for inst in stat.instructions],
            })

        self._push_data()

    @set_ev_cls(ofp_event.EventOFPMeterStatsReply, MAIN_DISPATCHER)
    def _meter_stats_reply_handler(self, ev):
        body = ev.msg.body

        for stat in body:
            mid = stat.meter_id
            if mid in self.meter_stats:
                ms = self.meter_stats[mid]
                ms['band_stats'] = []

                for idx, band_stat in enumerate(stat.band_stats):
                    band_entry = {
                        'band_index': idx,
                        'packet_band_count': band_stat.packet_band_count,
                        'byte_band_count': band_stat.byte_band_count
                    }
                    ms['band_stats'].append(band_entry)

                    if idx < len(ms['bands']):
                        band_type = ms['bands'][idx]['type']
                        if band_type == 'remark':
                            ms['remarked_packets'] = band_stat.packet_band_count
                            ms['remarked_bytes'] = band_stat.byte_band_count
                        elif band_type == 'drop':
                            ms['dropped_packets'] = band_stat.packet_band_count
                            ms['dropped_bytes'] = band_stat.byte_band_count

        self._push_data()

    def _get_flow_key(self, stat):
        match = stat.match
        key_parts = [f"table={stat.table_id}"]
        for field in ['eth_type', 'eth_src', 'eth_dst', 'ip_proto',
                      'ipv4_src', 'ipv4_dst', 'tcp_src', 'tcp_dst',
                      'udp_src', 'udp_dst']:
            if field in match:
                key_parts.append(f"{field}={match[field]}")
        return '|'.join(key_parts) if len(key_parts) > 1 else f'table_{stat.table_id}_default'

    def _push_data(self):
        if self.data_callback:
            meter_data = {}
            for mid, ms in self.meter_stats.items():
                meter_data[mid] = {
                    'meter_id': ms['meter_id'],
                    'name': ms['name'],
                    'bands': ms['bands'],
                    'band_stats': ms['band_stats'],
                    'remarked_packets': ms['remarked_packets'],
                    'remarked_bytes': ms['remarked_bytes'],
                    'dropped_packets': ms['dropped_packets'],
                    'dropped_bytes': ms['dropped_bytes'],
                }

            data = {
                'timestamp': time.time(),
                'flows': dict(self.flow_stats),
                'meter_chain': self.meter_chain,
                'meter_stats': meter_data,
                'flow_entries': self.raw_flow_entries,
            }
            self.data_callback(data)

    def update_meter_chain(self, new_chain):
        if self.datapath:
            ofproto = self.datapath.ofproto
            parser = self.datapath.ofproto_parser

            for meter_cfg in new_chain:
                bands = []
                for band_cfg in meter_cfg['bands']:
                    band = self._create_band(parser, band_cfg)
                    bands.append(band)

                mod = parser.OFPMeterMod(
                    datapath=self.datapath,
                    command=ofproto.OFPMC_MODIFY,
                    flags=ofproto.OFPMF_KBPS,
                    meter_id=meter_cfg['meter_id'],
                    bands=bands
                )
                self.datapath.send_msg(mod)

                if meter_cfg['meter_id'] not in self.meter_stats:
                    self.meter_stats[meter_cfg['meter_id']] = {
                        'meter_id': meter_cfg['meter_id'],
                        'name': meter_cfg['name'],
                        'bands': meter_cfg['bands'],
                        'band_stats': [],
                        'remarked_packets': 0,
                        'remarked_bytes': 0,
                        'dropped_packets': 0,
                        'dropped_bytes': 0,
                    }
                else:
                    self.meter_stats[meter_cfg['meter_id']]['bands'] = meter_cfg['bands']
                    self.meter_stats[meter_cfg['meter_id']]['name'] = meter_cfg['name']

            self.meter_chain = copy.deepcopy(new_chain)
            config.METER_CHAIN = copy.deepcopy(new_chain)

            self.logger.info("Meter chain updated: %d meters", len(new_chain))
            return True
        return False

    def get_meter_chain_config(self):
        return copy.deepcopy(self.meter_chain)
