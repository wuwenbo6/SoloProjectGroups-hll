from ryu.base import app_manager
from ryu.controller import ofp_event
from ryu.controller.handler import CONFIG_DISPATCHER, MAIN_DISPATCHER
from ryu.controller.handler import set_ev_cls
from ryu.ofproto import ofproto_v1_3
from ryu.lib.packet import packet
from ryu.lib.packet import ethernet
from ryu.lib.packet import ipv4
from ryu.lib.packet import tcp, udp
from ryu.lib import hub
import json
import time
from collections import defaultdict
from threading import Thread, Lock


class GroupController(app_manager.RyuApp):
    OFP_VERSIONS = [ofproto_v1_3.OFP_VERSION]

    def __init__(self, *args, **kwargs):
        super(GroupController, self).__init__(*args, **kwargs)
        self.mac_to_port = {}
        self.datapaths = {}
        self.group_stats = defaultdict(lambda: {
            'packet_count': 0,
            'byte_count': 0,
            'last_packet_count': 0,
            'last_byte_count': 0,
            'pps': 0,
            'bps': 0
        })
        self.port_stats = defaultdict(lambda: {
            'rx_packets': 0,
            'tx_packets': 0,
            'last_rx': 0,
            'last_tx': 0,
            'rx_pps': 0,
            'tx_pps': 0
        })
        self.stats_thread = hub.spawn(self._stats_monitor)
        self.websocket_thread = hub.spawn(self._websocket_server)
        self.ws_clients = set()
        self.group_type = 'ALL'
        self.test_running = False
        self.warmup_running = False
        self.warmup_seconds = 10
        self.warmup_start_time = 0
        self.test_start_time = 0
        self.weights = [50, 30, 20]
        self.wrr_index = 0
        self.wrr_current_count = 0
        self.wrr_lock = Lock()
        self.test_records = []
        self.current_test_record = None
        self.ff_port_status = {}

    @set_ev_cls(ofp_event.EventOFPSwitchFeatures, CONFIG_DISPATCHER)
    def switch_features_handler(self, ev):
        datapath = ev.msg.datapath
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        self.datapaths[datapath.id] = datapath
        self.mac_to_port.setdefault(datapath.id, {})

        match = parser.OFPMatch()
        actions = [parser.OFPActionOutput(ofproto.OFPP_CONTROLLER,
                                          ofproto.OFPCML_NO_BUFFER)]
        self.add_flow(datapath, 0, match, actions)

        self._create_group_tables(datapath)

    def _create_group_tables(self, datapath):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        ports = [2, 3, 4]
        buckets = []
        for port, weight in zip(ports, self.weights):
            actions = [parser.OFPActionOutput(port)]
            
            watch_port = port if self.group_type == 'FAST_FAILOVER' else ofproto.OFPP_ANY
            
            buckets.append(parser.OFPBucket(
                weight=weight,
                watch_port=watch_port,
                watch_group=ofproto.OFPG_ANY,
                actions=actions
            ))
            self.ff_port_status[port] = True

        if self.group_type == 'ALL':
            group_type = ofproto.OFPGT_ALL
        elif self.group_type == 'SELECT' or self.group_type == 'WEIGHTED_ROUND_ROBIN':
            group_type = ofproto.OFPGT_SELECT
        elif self.group_type == 'FAST_FAILOVER':
            group_type = ofproto.OFPGT_FF
        else:
            group_type = ofproto.OFPGT_INDIRECT

        req = parser.OFPGroupMod(
            datapath,
            ofproto.OFPGC_ADD,
            group_type,
            group_id=1,
            buckets=buckets
        )
        datapath.send_msg(req)
        self.logger.info(f"Group table {self.group_type} created on switch {datapath.id}, weights: {self.weights}")

    def add_flow(self, datapath, priority, match, actions, buffer_id=None):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        inst = [parser.OFPInstructionActions(ofproto.OFPIT_APPLY_ACTIONS,
                                             actions)]
        if buffer_id:
            mod = parser.OFPFlowMod(datapath=datapath, buffer_id=buffer_id,
                                    priority=priority, match=match,
                                    instructions=inst)
        else:
            mod = parser.OFPFlowMod(datapath=datapath, priority=priority,
                                    match=match, instructions=inst)
        datapath.send_msg(mod)

    def add_group_flow(self, datapath, priority, match, group_id=1):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        actions = [parser.OFPActionGroup(group_id)]
        inst = [parser.OFPInstructionActions(ofproto.OFPIT_APPLY_ACTIONS,
                                             actions)]
        mod = parser.OFPFlowMod(datapath=datapath, priority=priority,
                                match=match, instructions=inst)
        datapath.send_msg(mod)

    @set_ev_cls(ofp_event.EventOFPPacketIn, MAIN_DISPATCHER)
    def _packet_in_handler(self, ev):
        if self.warmup_running:
            return

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

        ip_pkt = pkt.get_protocol(ipv4.ipv4)
        if ip_pkt:
            match = parser.OFPMatch(
                eth_type=0x0800,
                ipv4_src=ip_pkt.src,
                ipv4_dst=ip_pkt.dst
            )
            self.add_group_flow(datapath, 10, match, group_id=1)

            actions = [parser.OFPActionGroup(group_id=1)]
            data = None
            if msg.buffer_id == ofproto.OFP_NO_BUFFER:
                data = msg.data

            out = parser.OFPPacketOut(datapath=datapath, buffer_id=msg.buffer_id,
                                      in_port=in_port, actions=actions, data=data)
            datapath.send_msg(out)
            return

        if dst in self.mac_to_port[dpid]:
            out_port = self.mac_to_port[dpid][dst]
        else:
            out_port = ofproto.OFPP_FLOOD

        actions = [parser.OFPActionOutput(out_port)]

        if out_port != ofproto.OFPP_FLOOD:
            match = parser.OFPMatch(in_port=in_port, eth_dst=dst, eth_src=src)
            if msg.buffer_id != ofproto.OFP_NO_BUFFER:
                self.add_flow(datapath, 1, match, actions, msg.buffer_id)
                return
            else:
                self.add_flow(datapath, 1, match, actions)
        data = None
        if msg.buffer_id == ofproto.OFP_NO_BUFFER:
            data = msg.data

        out = parser.OFPPacketOut(datapath=datapath, buffer_id=msg.buffer_id,
                                  in_port=in_port, actions=actions, data=data)
        datapath.send_msg(out)

    def _stats_monitor(self):
        while True:
            for dpid, dp in self.datapaths.items():
                self._request_group_stats(dp)
                self._request_port_stats(dp)
            hub.sleep(1)

    def _request_group_stats(self, datapath):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser
        req = parser.OFPGroupStatsRequest(datapath, 0, ofproto.OFPG_ALL)
        datapath.send_msg(req)

    def _request_port_stats(self, datapath):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser
        req = parser.OFPPortStatsRequest(datapath, 0, ofproto.OFPP_ANY)
        datapath.send_msg(req)

    @set_ev_cls(ofp_event.EventOFPGroupStatsReply, MAIN_DISPATCHER)
    def _group_stats_reply_handler(self, ev):
        if self.warmup_running:
            return

        body = ev.msg.body
        dpid = ev.msg.datapath.id

        for stat in body:
            key = f"{dpid}_{stat.group_id}"
            stats = self.group_stats[key]
            
            delta_packets = stat.packet_count - stats['last_packet_count']
            delta_bytes = stat.byte_count - stats['last_byte_count']
            
            stats['packet_count'] = stat.packet_count
            stats['byte_count'] = stat.byte_count
            stats['pps'] = delta_packets
            stats['bps'] = delta_bytes * 8
            stats['last_packet_count'] = stat.packet_count
            stats['last_byte_count'] = stat.byte_count

        self._broadcast_stats()

    @set_ev_cls(ofp_event.EventOFPPortStatsReply, MAIN_DISPATCHER)
    def _port_stats_reply_handler(self, ev):
        if self.warmup_running:
            return

        body = ev.msg.body
        dpid = ev.msg.datapath.id

        for stat in body:
            key = f"{dpid}_{stat.port_no}"
            stats = self.port_stats[key]
            
            delta_rx = stat.rx_packets - stats['last_rx']
            delta_tx = stat.tx_packets - stats['last_tx']
            
            stats['rx_packets'] = stat.rx_packets
            stats['tx_packets'] = stat.tx_packets
            stats['rx_pps'] = delta_rx
            stats['tx_pps'] = delta_tx
            stats['last_rx'] = stat.rx_packets
            stats['last_tx'] = stat.tx_packets

    def _websocket_server(self):
        import asyncio
        import websockets

        async def handle_client(websocket, path):
            self.ws_clients.add(websocket)
            try:
                async for message in websocket:
                    await self._handle_ws_message(websocket, message)
            finally:
                self.ws_clients.remove(websocket)

        async def server():
            async with websockets.serve(handle_client, "0.0.0.0", 6789):
                await asyncio.Future()

        asyncio.run(server())

    async def _handle_ws_message(self, websocket, message):
        try:
            data = json.loads(message)
            cmd = data.get('command')
            
            if cmd == 'start_test':
                self.group_type = data.get('group_type', 'ALL')
                self.weights = data.get('weights', [50, 30, 20])
                self.warmup_seconds = data.get('warmup_seconds', 10)
                num_flows = data.get('num_flows', 5)
                pps_per_flow = data.get('pps_per_flow', 2000)
                self._start_warmup(num_flows, pps_per_flow)
                await websocket.send(json.dumps({
                    'status': 'warmup_started',
                    'group_type': self.group_type,
                    'warmup_seconds': self.warmup_seconds
                }))
            
            elif cmd == 'stop_test':
                self._save_test_record()
                self.test_running = False
                self.warmup_running = False
                await websocket.send(json.dumps({'status': 'test_stopped'}))
            
            elif cmd == 'get_stats':
                await websocket.send(json.dumps(self._get_stats_data()))
            
            elif cmd == 'export_p4_report':
                report = self._generate_p4_report()
                await websocket.send(json.dumps({
                    'status': 'p4_report',
                    'report': report
                }))
            
            elif cmd == 'export_csv_report':
                report = self._generate_csv_report()
                await websocket.send(json.dumps({
                    'status': 'csv_report',
                    'report': report
                }))
            
            elif cmd == 'get_test_records':
                await websocket.send(json.dumps({
                    'status': 'test_records',
                    'records': self.test_records
                }))
        
        except Exception as e:
            self.logger.error(f"WebSocket error: {e}")

    def _start_warmup(self, num_flows=5, pps_per_flow=2000):
        self.warmup_running = True
        self.test_running = False
        self.warmup_start_time = time.time()
        
        self.current_test_record = {
            'group_type': self.group_type,
            'num_flows': num_flows,
            'pps_per_flow': pps_per_flow,
            'weights': self.weights,
            'warmup_seconds': self.warmup_seconds,
            'start_time': None,
            'end_time': None,
            'duration': 0,
            'total_packets': 0,
            'total_bytes': 0,
            'avg_pps': 0,
            'avg_bps': 0,
            'peak_pps': 0,
            'port_stats': {}
        }
        
        self._reset_stats()
        for dp in self.datapaths.values():
            self._recreate_group_table(dp)
        
        self.logger.info(f"Warmup started for {self.warmup_seconds} seconds")
        
        def warmup_timer():
            time.sleep(self.warmup_seconds)
            if self.warmup_running:
                self.warmup_running = False
                self.test_running = True
                self.test_start_time = time.time()
                self.current_test_record['start_time'] = self.test_start_time
                self._reset_stats()
                self.logger.info("Warmup complete. Test started!")
        
        warmup_thread = Thread(target=warmup_timer)
        warmup_thread.daemon = True
        warmup_thread.start()
    
    def _save_test_record(self):
        if self.current_test_record and self.test_running:
            end_time = time.time()
            duration = end_time - (self.current_test_record['start_time'] or end_time)
            
            total_packets = 0
            total_bytes = 0
            port_stats_summary = {}
            
            for key, stat in self.group_stats.items():
                total_packets += stat['packet_count']
                total_bytes += stat['byte_count']
            
            for key, stat in self.port_stats.items():
                port_no = key.split('_')[-1]
                port_stats_summary[port_no] = {
                    'rx_packets': stat['rx_packets'],
                    'tx_packets': stat['tx_packets'],
                    'avg_pps': (stat['rx_packets'] + stat['tx_packets']) / max(duration, 1)
                }
            
            self.current_test_record.update({
                'end_time': end_time,
                'duration': duration,
                'total_packets': total_packets,
                'total_bytes': total_bytes,
                'avg_pps': total_packets / max(duration, 1),
                'avg_bps': total_bytes * 8 / max(duration, 1),
                'port_stats': port_stats_summary
            })
            
            self.test_records.append(self.current_test_record)
            self.logger.info(f"Test record saved: {len(self.test_records)} total records")
    
    def _generate_p4_report(self):
        report = []
        report.append('/*')
        report.append(' * OpenFlow Group Table Performance Test Report')
        report.append(' * Generated by Ryu Controller P4 Performance Analyzer')
        report.append(f' * Date: {time.strftime("%Y-%m-%d %H:%M:%S")}')
        report.append(' */')
        report.append('')
        report.append('#ifndef GROUP_TABLE_TEST_REPORT_P4')
        report.append('#define GROUP_TABLE_TEST_REPORT_P4')
        report.append('')
        report.append('/* ========================================')
        report.append('   TEST CONFIGURATION')
        report.append('   ======================================== */')
        report.append('')
        
        for i, record in enumerate(self.test_records):
            report.append(f'/* Test #{i + 1} */')
            report.append(f'const group_type_t test_{i+1}_type = {record["group_type"]};')
            report.append(f'const bit<32> test_{i+1}_num_flows = {record["num_flows"]};')
            report.append(f'const bit<32> test_{i+1}_pps_per_flow = {record["pps_per_flow"]};')
            report.append(f'const bit<32> test_{i+1}_warmup_seconds = {record["warmup_seconds"]};')
            report.append('')
        
        report.append('/* ========================================')
        report.append('   PERFORMANCE RESULTS')
        report.append('   ======================================== */')
        report.append('')
        
        for i, record in enumerate(self.test_records):
            report.append(f'/* Test #{i + 1} Results - {record["group_type"]} */')
            report.append(f'struct test_{i+1}_results {{')
            report.append(f'    bit<64> total_packets;    // {record["total_packets"]:,}')
            report.append(f'    bit<64> total_bytes;      // {record["total_bytes"]:,}')
            report.append(f'    bit<32> duration_sec;     // {record["duration"]:.2f}s')
            report.append(f'    bit<32> avg_pps;          // {record["avg_pps"]:.2f}')
            report.append(f'    bit<32> avg_bps;          // {record["avg_bps"]:.2f}')
            report.append(f'}} test_{i+1}_results = {{')
            report.append(f'    {record["total_packets"]},')
            report.append(f'    {record["total_bytes"]},')
            report.append(f'    {int(record["duration"])},')
            report.append(f'    {int(record["avg_pps"])},')
            report.append(f'    {int(record["avg_bps"])}')
            report.append(f'}};')
            report.append('')
        
        report.append('/* ========================================')
        report.append('   GROUP TABLE DEFINITIONS')
        report.append('   ======================================== */')
        report.append('')
        report.append('enum group_type_t {')
        report.append('    ALL,               // Multicast to all ports')
        report.append('    INDIRECT,          // Single port selection')
        report.append('    WEIGHTED_ROUND_ROBIN,  // Weighted distribution')
        report.append('    FAST_FAILOVER      // Port redundancy')
        report.append('}')
        report.append('')
        report.append('/* ========================================')
        report.append('   COMPARATIVE ANALYSIS')
        report.append('   ======================================== */')
        report.append('')
        
        if len(self.test_records) > 1:
            report.append('/* Performance Comparison Table:')
            report.append('')
            report.append(f'{"Test":<6} {"Type":<25} {"Flows":<8} {"PPS/Flow":<10} {"Duration":<10} {"Total Pkts":<15} {"Avg PPS":<12}')
            report.append('-' * 90)
            for i, record in enumerate(self.test_records):
                report.append(f'{i+1:<6} {record["group_type"]:<25} {record["num_flows"]:<8} {record["pps_per_flow"]:<10} {record["duration"]:>7.2f}s  {record["total_packets"]:>13,} {record["avg_pps"]:>10,.2f}')
            report.append('*/')
            report.append('')
        
        report.append('#endif')
        
        return '\n'.join(report)
    
    def _generate_csv_report(self):
        import csv
        import io
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow(['Test #', 'Group Type', 'Num Flows', 'PPS/Flow', 
                        'Warmup (s)', 'Duration (s)', 'Total Packets', 
                        'Total Bytes', 'Avg PPS', 'Avg BPS'])
        
        for i, record in enumerate(self.test_records):
            writer.writerow([
                i + 1,
                record['group_type'],
                record['num_flows'],
                record['pps_per_flow'],
                record['warmup_seconds'],
                f"{record['duration']:.2f}",
                record['total_packets'],
                record['total_bytes'],
                f"{record['avg_pps']:.2f}",
                f"{record['avg_bps']:.2f}"
            ])
        
        return output.getvalue()

    def _reset_stats(self):
        for key in self.group_stats:
            self.group_stats[key] = {
                'packet_count': 0,
                'byte_count': 0,
                'last_packet_count': 0,
                'last_byte_count': 0,
                'pps': 0,
                'bps': 0
            }
        
        for key in self.port_stats:
            self.port_stats[key] = {
                'rx_packets': 0,
                'tx_packets': 0,
                'last_rx': 0,
                'last_tx': 0,
                'rx_pps': 0,
                'tx_pps': 0
            }

    def _recreate_group_table(self, datapath):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser
        
        del_req = parser.OFPGroupMod(
            datapath,
            ofproto.OFPGC_DELETE,
            0,
            group_id=1
        )
        datapath.send_msg(del_req)
        
        hub.sleep(0.5)
        self._create_group_tables(datapath)

    def get_warmup_progress(self):
        if not self.warmup_running:
            return 100
        elapsed = time.time() - self.warmup_start_time
        progress = (elapsed / self.warmup_seconds) * 100
        return min(progress, 100)

    def get_elapsed_time(self):
        if self.test_running:
            return time.time() - self.test_start_time
        return 0

    def _get_stats_data(self):
        return {
            'group_stats': dict(self.group_stats),
            'port_stats': dict(self.port_stats),
            'group_type': self.group_type,
            'test_running': self.test_running,
            'warmup_running': self.warmup_running,
            'warmup_progress': self.get_warmup_progress(),
            'warmup_seconds': self.warmup_seconds,
            'elapsed_time': self.get_elapsed_time(),
            'weights': self.weights,
            'ff_port_status': self.ff_port_status,
            'test_records_count': len(self.test_records),
            'timestamp': time.time()
        }

    def _broadcast_stats(self):
        if not self.ws_clients:
            return
        
        data = json.dumps(self._get_stats_data())
        for ws in self.ws_clients:
            hub.spawn(self._send_ws_message, ws, data)

    async def _send_ws_message(self, ws, data):
        try:
            await ws.send(data)
        except:
            pass
