from ryu.base import app_manager
from ryu.controller import ofp_event
from ryu.controller.handler import CONFIG_DISPATCHER, MAIN_DISPATCHER, DEAD_DISPATCHER
from ryu.controller.handler import set_ev_cls
from ryu.ofproto import ofproto_v1_3
from ryu.lib.packet import packet
from ryu.lib.packet import ethernet
from ryu.lib.packet import ipv4
from ryu.lib.packet import arp
from ryu.lib import hub
import json
import time
import os
import threading
from collections import defaultdict, deque


class CpuMonitor(object):
    def __init__(self):
        self._process = None
        self._init_process()

    def _init_process(self):
        try:
            import psutil
            self._process = psutil.Process(os.getpid())
        except ImportError:
            self._process = None

    def get_cpu_percent(self):
        if self._process:
            try:
                return self._process.cpu_percent(interval=0.1)
            except Exception:
                return 0.0
        return self._get_cpu_fallback()

    def _get_cpu_fallback(self):
        try:
            stat_file = '/proc/stat'
            if not os.path.exists(stat_file):
                return 0.0
            with open(stat_file, 'r') as f:
                line = f.readline()
            values = [int(x) for x in line.split()[1:]]
            idle = values[3]
            total = sum(values)
            time.sleep(0.1)
            with open(stat_file, 'r') as f:
                line = f.readline()
            values2 = [int(x) for x in line.split()[1:]]
            idle2 = values2[3]
            total2 = sum(values2)
            diff_idle = idle2 - idle
            diff_total = total2 - total
            if diff_total == 0:
                return 0.0
            return (1.0 - diff_idle / diff_total) * 100.0
        except Exception:
            return 0.0


class GroupController(app_manager.RyuApp):
    OFP_VERSIONS = [ofproto_v1_3.OFP_VERSION]

    def __init__(self, *args, **kwargs):
        super(GroupController, self).__init__(*args, **kwargs)
        self.mac_to_port = {}
        self.datapaths = {}
        self.group_stats = defaultdict(dict)
        self.port_status = defaultdict(dict)
        self.switch_events = defaultdict(lambda: deque(maxlen=100))
        self.barrier_events = {}
        self.xid_counter = 0
        self.start_time = time.time()
        self.cpu_monitor = CpuMonitor()
        self.cpu_samples = defaultdict(list)
        self.cpu_sampling_active = {}
        self.monitor_thread = hub.spawn(self._monitor)

    @set_ev_cls(ofp_event.EventOFPSwitchFeatures, CONFIG_DISPATCHER)
    def switch_features_handler(self, ev):
        datapath = ev.msg.datapath
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        self.datapaths[datapath.id] = datapath
        self.mac_to_port.setdefault(datapath.id, {})

        self.logger.info("Switch %s connected", datapath.id)

        match = parser.OFPMatch()
        actions = [parser.OFPActionOutput(ofproto.OFPP_CONTROLLER,
                                          ofproto.OFPCML_NO_BUFFER)]
        self.add_flow(datapath, 0, match, actions)

        self._setup_groups(datapath)

    def _setup_groups(self, datapath):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        self._create_all_group(datapath, 1, [2, 3, 4])
        self._create_indirect_group(datapath, 2)
        self._create_ff_group(datapath, 3, [2, 3, 4])

        self._setup_chained_groups(datapath)

    def _create_all_group(self, datapath, group_id, ports):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        buckets = []
        for port in ports:
            actions = [parser.OFPActionOutput(port)]
            buckets.append(parser.OFPBucket(actions=actions))

        req = parser.OFPGroupMod(
            datapath,
            ofproto.OFPGC_ADD,
            ofproto.OFPGT_ALL,
            group_id,
            buckets
        )
        datapath.send_msg(req)
        self.logger.info("Created ALL group %s with ports %s", group_id, ports)

    def _create_indirect_group(self, datapath, group_id, actions=None):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        if actions is None:
            actions = [parser.OFPActionOutput(2)]
        buckets = [parser.OFPBucket(actions=actions)]

        req = parser.OFPGroupMod(
            datapath,
            ofproto.OFPGC_ADD,
            ofproto.OFPGT_INDIRECT,
            group_id,
            buckets
        )
        datapath.send_msg(req)
        self.logger.info("Created INDIRECT group %s", group_id)

    def _create_ff_group(self, datapath, group_id, ports):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        buckets = []
        for port in ports:
            watch_port = port
            actions = [parser.OFPActionOutput(port)]
            buckets.append(parser.OFPBucket(
                watch_port=watch_port,
                watch_group=ofproto.OFPG_ANY,
                actions=actions
            ))

        req = parser.OFPGroupMod(
            datapath,
            ofproto.OFPGC_ADD,
            ofproto.OFPGT_FF,
            group_id,
            buckets
        )
        datapath.send_msg(req)
        self.logger.info("Created FAST_FAILOVER group %s with ports %s", group_id, ports)

    def _setup_chained_groups(self, datapath):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        self._create_indirect_group(datapath, 10, actions=[parser.OFPActionOutput(2)])
        self._create_indirect_group(datapath, 11, actions=[parser.OFPActionOutput(3)])
        self._create_indirect_group(datapath, 12, actions=[parser.OFPActionOutput(4)])

        buckets_all_indirect = [
            parser.OFPBucket(actions=[parser.OFPActionGroup(10)]),
            parser.OFPBucket(actions=[parser.OFPActionGroup(11)]),
            parser.OFPBucket(actions=[parser.OFPActionGroup(12)])
        ]
        req = parser.OFPGroupMod(
            datapath, ofproto.OFPGC_ADD, ofproto.OFPGT_ALL, 20,
            buckets_all_indirect
        )
        datapath.send_msg(req)
        self.logger.info("Created chained group ALL->INDIRECT (id=20)")

        buckets_ff_indirect = [
            parser.OFPBucket(
                watch_port=2,
                watch_group=ofproto.OFPG_ANY,
                actions=[parser.OFPActionGroup(10)]
            ),
            parser.OFPBucket(
                watch_port=3,
                watch_group=ofproto.OFPG_ANY,
                actions=[parser.OFPActionGroup(11)]
            ),
            parser.OFPBucket(
                watch_port=4,
                watch_group=ofproto.OFPG_ANY,
                actions=[parser.OFPActionGroup(12)]
            )
        ]
        req = parser.OFPGroupMod(
            datapath, ofproto.OFPGC_ADD, ofproto.OFPGT_FF, 21,
            buckets_ff_indirect
        )
        datapath.send_msg(req)
        self.logger.info("Created chained group FF->INDIRECT (id=21)")

        self._create_indirect_group(datapath, 13, actions=[parser.OFPActionOutput(2)])
        buckets_indirect_indirect = [
            parser.OFPBucket(actions=[parser.OFPActionGroup(13)])
        ]
        req = parser.OFPGroupMod(
            datapath, ofproto.OFPGC_ADD, ofproto.OFPGT_INDIRECT, 22,
            buckets_indirect_indirect
        )
        datapath.send_msg(req)
        self.logger.info("Created chained group INDIRECT->INDIRECT (id=22)")

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

    def add_group_flow(self, datapath, priority, match, group_id):
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

    def _monitor(self):
        while True:
            for dp in self.datapaths.values():
                self._request_stats(dp)
            hub.sleep(1)

    def _request_stats(self, datapath):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        req = parser.OFPGroupStatsRequest(datapath)
        datapath.send_msg(req)

        req = parser.OFPPortStatsRequest(datapath, 0, ofproto.OFPP_ANY)
        datapath.send_msg(req)

    @set_ev_cls(ofp_event.EventOFPGroupStatsReply, MAIN_DISPATCHER)
    def _group_stats_reply_handler(self, ev):
        msg = ev.msg
        datapath = msg.datapath
        body = msg.body

        for stat in body:
            group_id = stat.group_id
            packet_count = stat.packet_count
            byte_count = stat.byte_count

            self.group_stats[datapath.id][group_id] = {
                'packet_count': packet_count,
                'byte_count': byte_count,
                'timestamp': time.time()
            }

    def send_barrier(self, datapath, timeout=5):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        xid = datapath.xid
        self.barrier_events[xid] = hub.Event()

        req = parser.OFPBarrierRequest(datapath)
        datapath.send_msg(req)

        self.logger.debug("Sent BarrierRequest (xid=%s)", xid)

        if not self.barrier_events[xid].wait(timeout):
            del self.barrier_events[xid]
            self.logger.warning("Barrier timeout (xid=%s)", xid)
            return False

        del self.barrier_events[xid]
        return True

    @set_ev_cls(ofp_event.EventOFPBarrierReply, MAIN_DISPATCHER)
    def _barrier_reply_handler(self, ev):
        msg = ev.msg
        xid = msg.xid

        if xid in self.barrier_events:
            self.barrier_events[xid].set()
            self.logger.debug("BarrierReply received (xid=%s)", xid)

    @set_ev_cls(ofp_event.EventOFPPortStatus, MAIN_DISPATCHER)
    def _port_status_handler(self, ev):
        msg = ev.msg
        datapath = msg.datapath
        dpid = datapath.id
        ofproto = datapath.ofproto

        reason = msg.reason
        port_no = msg.desc.port_no
        port_name = msg.desc.name.decode('utf-8') if hasattr(msg.desc, 'name') else f'port-{port_no}'

        reason_map = {
            ofproto.OFPPR_ADD: 'PORT_ADDED',
            ofproto.OFPPR_DELETE: 'PORT_DELETED',
            ofproto.OFPPR_MODIFY: 'PORT_MODIFIED'
        }
        reason_str = reason_map.get(reason, f'UNKNOWN({reason})')

        if hasattr(msg.desc, 'state'):
            state = msg.desc.state
            is_down = (state & ofproto.OFPPS_LINK_DOWN) != 0
            status = 'DOWN' if is_down else 'UP'
        else:
            status = 'UNKNOWN'

        self.port_status[dpid][port_no] = {
            'port_no': port_no,
            'port_name': port_name,
            'status': status,
            'state': getattr(msg.desc, 'state', 0),
            'last_change': time.time()
        }

        event = {
            'timestamp': time.time(),
            'type': 'PORT_STATUS',
            'dpid': dpid,
            'port_no': port_no,
            'port_name': port_name,
            'reason': reason_str,
            'status': status
        }
        self.switch_events[dpid].append(event)

        self.logger.info(
            "Port status change: dpid=%s, port=%s (%s), reason=%s, status=%s",
            dpid, port_no, port_name, reason_str, status
        )

        if status == 'DOWN':
            self._handle_port_down(datapath, port_no)

    def _handle_port_down(self, datapath, port_no):
        dpid = datapath.id
        self.logger.warning("Port %s down on switch %s - checking fast failover groups", port_no, dpid)

        event = {
            'timestamp': time.time(),
            'type': 'FAILOVER_TRIGGERED',
            'dpid': dpid,
            'failed_port': port_no,
            'message': f'Port {port_no} down - fast failover should switch to next live bucket'
        }
        self.switch_events[dpid].append(event)

    def get_port_status(self, dpid=None):
        if dpid:
            return dict(self.port_status.get(dpid, {}))
        return {dpid: dict(ports) for dpid, ports in self.port_status.items()}

    def get_switch_events(self, dpid=None):
        if dpid:
            return list(self.switch_events.get(dpid, []))
        return {dpid: list(events) for dpid, events in self.switch_events.items()}

    def start_cpu_sampling(self, label):
        self.cpu_samples[label] = []
        self.cpu_sampling_active[label] = True
        hub.spawn(self._cpu_sampling_loop, label)

    def stop_cpu_sampling(self, label):
        self.cpu_sampling_active[label] = False

    def _cpu_sampling_loop(self, label):
        while self.cpu_sampling_active.get(label, False):
            cpu = self.cpu_monitor.get_cpu_percent()
            self.cpu_samples[label].append({
                'timestamp': time.time(),
                'cpu_percent': cpu
            })
            hub.sleep(0.5)

    def get_cpu_stats(self, label=None):
        if label:
            samples = self.cpu_samples.get(label, [])
            if not samples:
                return {'label': label, 'avg_cpu': 0, 'max_cpu': 0, 'min_cpu': 0, 'samples': 0}
            cpu_values = [s['cpu_percent'] for s in samples]
            return {
                'label': label,
                'avg_cpu': sum(cpu_values) / len(cpu_values),
                'max_cpu': max(cpu_values),
                'min_cpu': min(cpu_values),
                'samples': len(cpu_values)
            }
        result = {}
        for lbl in self.cpu_samples:
            result[lbl] = self.get_cpu_stats(lbl)
        return result

    @set_ev_cls(ofp_event.EventOFPPortStatsReply, MAIN_DISPATCHER)
    def _port_stats_reply_handler(self, ev):
        pass


class GroupTestController(GroupController):
    def __init__(self, *args, **kwargs):
        super(GroupTestController, self).__init__(*args, **kwargs)
        self.test_results = defaultdict(dict)
        self.current_group_type = None
        self.test_start_time = None
        self.test_duration = 10
        self.flow_installed = defaultdict(dict)
        self.chain_results = defaultdict(dict)

        self.group_map = {
            'all': 1,
            'indirect': 2,
            'fast_failover': 3
        }
        self.chain_map = {
            'all_indirect': 20,
            'ff_indirect': 21,
            'indirect_indirect': 22
        }

    def add_group_flow_with_barrier(self, datapath, priority, match, group_id):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        actions = [parser.OFPActionGroup(group_id)]
        inst = [parser.OFPInstructionActions(ofproto.OFPIT_APPLY_ACTIONS,
                                             actions)]
        mod = parser.OFPFlowMod(datapath=datapath, priority=priority,
                                match=match, instructions=inst)
        datapath.send_msg(mod)
        self.logger.debug("FlowMod sent for group %s", group_id)

        return self.send_barrier(datapath)

    def start_test(self, group_type, group_id):
        self.current_group_type = group_type
        self.logger.info("Starting test for group type: %s (group_id: %s)", group_type, group_id)

        self.start_cpu_sampling(group_type)

        for dp in self.datapaths.values():
            ofproto = dp.ofproto
            parser = dp.ofproto_parser

            match = parser.OFPMatch(eth_type=0x0800, ipv4_dst='10.0.0.0/24')

            self.logger.info("Installing flow rules and waiting for Barrier confirmation...")
            success = self.add_group_flow_with_barrier(dp, 100, match, group_id)

            if success:
                self.logger.info("Flow rules installed and confirmed via Barrier for switch %s", dp.id)
                self.flow_installed[dp.id][group_type] = True
            else:
                self.logger.warning("Barrier timeout - flow may not be fully installed for switch %s", dp.id)
                self.flow_installed[dp.id][group_type] = False

        self.test_start_time = time.time()
        self.logger.info("Test started - flow installation confirmed")

        hub.spawn(self._collect_test_results, group_type, group_id)

    def start_chain_test(self, chain_type):
        if chain_type not in self.chain_map:
            self.logger.error("Unknown chain type: %s", chain_type)
            return

        group_id = self.chain_map[chain_type]
        self.logger.info("Starting chain test for: %s (group_id: %s)", chain_type, group_id)

        self.start_cpu_sampling(f'chain_{chain_type}')

        for dp in self.datapaths.values():
            ofproto = dp.ofproto
            parser = dp.ofproto_parser

            match = parser.OFPMatch(eth_type=0x0800, ipv4_dst='10.0.0.0/24')
            success = self.add_group_flow_with_barrier(dp, 100, match, group_id)

            if success:
                self.logger.info("Chain flow rules confirmed for switch %s", dp.id)
                self.flow_installed[dp.id][f'chain_{chain_type}'] = True
            else:
                self.logger.warning("Chain flow Barrier timeout for switch %s", dp.id)
                self.flow_installed[dp.id][f'chain_{chain_type}'] = False

        test_start = time.time()

        def _collect_chain():
            hub.sleep(self.test_duration)
            self.stop_cpu_sampling(f'chain_{chain_type}')

            end_time = time.time()
            duration = end_time - test_start

            results = []
            for dpid, stats in self.group_stats.items():
                if group_id in stats:
                    stat = stats[group_id]
                    packets = stat['packet_count']
                    bytes_ = stat['byte_count']
                    pps = packets / duration
                    bps = (bytes_ * 8) / duration

                    cpu_stat = self.get_cpu_stats(f'chain_{chain_type}')

                    results.append({
                        'dpid': dpid,
                        'chain_type': chain_type,
                        'group_id': group_id,
                        'duration': duration,
                        'packets': packets,
                        'bytes': bytes_,
                        'pps': pps,
                        'bps': bps,
                        'mbps': bps / 1000000,
                        'cpu_avg': cpu_stat.get('avg_cpu', 0),
                        'cpu_max': cpu_stat.get('max_cpu', 0)
                    })

            self.chain_results[chain_type] = results
            self.logger.info("Chain test completed for %s: %s", chain_type, json.dumps(results, indent=2))

        hub.spawn(_collect_chain)

    def is_flow_installed(self, dpid, group_type):
        return self.flow_installed.get(dpid, {}).get(group_type, False)

    def _collect_test_results(self, group_type, group_id):
        hub.sleep(self.test_duration)
        self.stop_cpu_sampling(group_type)

        end_time = time.time()
        duration = end_time - self.test_start_time

        results = []
        for dpid, stats in self.group_stats.items():
            if group_id in stats:
                stat = stats[group_id]
                packets = stat['packet_count']
                bytes_ = stat['byte_count']
                pps = packets / duration
                bps = (bytes_ * 8) / duration

                cpu_stat = self.get_cpu_stats(group_type)

                results.append({
                    'dpid': dpid,
                    'group_type': group_type,
                    'group_id': group_id,
                    'duration': duration,
                    'packets': packets,
                    'bytes': bytes_,
                    'pps': pps,
                    'bps': bps,
                    'mbps': bps / 1000000,
                    'cpu_avg': cpu_stat.get('avg_cpu', 0),
                    'cpu_max': cpu_stat.get('max_cpu', 0)
                })

        self.test_results[group_type] = results
        self.logger.info("Test completed for %s: %s", group_type, json.dumps(results, indent=2))

    def get_test_results(self):
        return dict(self.test_results)

    def get_chain_results(self):
        return dict(self.chain_results)

    def get_all_cpu_stats(self):
        all_stats = {}
        for label in list(self.group_map.keys()) + [f'chain_{k}' for k in self.chain_map.keys()]:
            if label in self.cpu_samples and self.cpu_samples[label]:
                all_stats[label] = self.get_cpu_stats(label)
        return all_stats

    def reset_all_flows(self):
        for dp in self.datapaths.values():
            ofproto = dp.ofproto
            parser = dp.ofproto_parser

            mod = parser.OFPFlowMod(
                datapath=dp,
                command=ofproto.OFPFC_DELETE,
                out_port=ofproto.OFPP_ANY,
                out_group=ofproto.OFPG_ANY
            )
            dp.send_msg(mod)

        self.logger.info("All flows reset")
