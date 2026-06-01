#!/usr/bin/env python
from mininet.topo import Topo
from mininet.net import Mininet
from mininet.node import Controller, RemoteController
from mininet.cli import CLI
from mininet.log import setLogLevel, info
from mininet.link import TCLink
import time
import threading


class GroupTestTopo(Topo):
    def build(self):
        s1 = self.addSwitch('s1')
        
        h1 = self.addHost('h1', ip='10.0.0.1/24')
        h2 = self.addHost('h2', ip='10.0.0.2/24')
        h3 = self.addHost('h3', ip='10.0.0.3/24')
        h4 = self.addHost('h4', ip='10.0.0.4/24')
        
        self.addLink(h1, s1)
        self.addLink(h2, s1)
        self.addLink(h3, s1)
        self.addLink(h4, s1)


class TrafficGenerator:
    def __init__(self, net):
        self.net = net
        self.running = False
        self.threads = []
    
    def start_iperf_server(self, host):
        server = self.net.get(host)
        server.cmd('iperf -s -u &')
        info(f'Started iperf server on {host}\n')
    
    def generate_udp_traffic(self, src, dst, duration=60, bandwidth='10M'):
        src_host = self.net.get(src)
        dst_host = self.net.get(dst)
        dst_ip = dst_host.IP()
        
        def run_traffic():
            while self.running:
                src_host.cmd(f'iperf -c {dst_ip} -u -b {bandwidth} -t 1 > /dev/null 2>&1')
                time.sleep(0.1)
        
        thread = threading.Thread(target=run_traffic)
        thread.daemon = True
        thread.start()
        self.threads.append(thread)
        info(f'Started UDP traffic from {src} to {dst} at {bandwidth}\n')
    
    def generate_tcp_traffic(self, src, dst, duration=60):
        src_host = self.net.get(src)
        dst_host = self.net.get(dst)
        dst_ip = dst_host.IP()
        
        def run_traffic():
            while self.running:
                src_host.cmd(f'iperf -c {dst_ip} -t 1 > /dev/null 2>&1')
                time.sleep(0.5)
        
        thread = threading.Thread(target=run_traffic)
        thread.daemon = True
        thread.start()
        self.threads.append(thread)
        info(f'Started TCP traffic from {src} to {dst}\n')
    
    def generate_ping_flood(self, src, dst, count=1000):
        src_host = self.net.get(src)
        dst_host = self.net.get(dst)
        dst_ip = dst_host.IP()
        
        def run_traffic():
            while self.running:
                src_host.cmd(f'ping -f -c {count} {dst_ip} > /dev/null 2>&1')
                time.sleep(0.1)
        
        thread = threading.Thread(target=run_traffic)
        thread.daemon = True
        thread.start()
        self.threads.append(thread)
        info(f'Started ping flood from {src} to {dst}\n')
    
    def start_all_traffic(self):
        self.running = True
        
        self.start_iperf_server('h2')
        self.start_iperf_server('h3')
        self.start_iperf_server('h4')
        
        time.sleep(1)
        
        self.generate_udp_traffic('h1', 'h2', bandwidth='20M')
        self.generate_udp_traffic('h1', 'h3', bandwidth='20M')
        self.generate_udp_traffic('h1', 'h4', bandwidth='20M')
        
        self.generate_tcp_traffic('h1', 'h2')
        self.generate_tcp_traffic('h1', 'h3')
        
        info('All traffic generators started\n')
    
    def stop_all_traffic(self):
        self.running = False
        for thread in self.threads:
            thread.join(timeout=2)
        self.threads = []
        info('All traffic generators stopped\n')


def run_network():
    topo = GroupTestTopo()
    
    net = Mininet(
        topo=topo,
        controller=RemoteController('c0', ip='127.0.0.1', port=6653),
        link=TCLink,
        cleanup=True
    )
    
    net.start()
    
    info('*** Network started\n')
    info('*** Hosts:\n')
    for host in net.hosts:
        info(f'  {host.name}: {host.IP()}\n')
    
    traffic_gen = TrafficGenerator(net)
    
    CLI(net, locals={'traffic_gen': traffic_gen})
    
    traffic_gen.stop_all_traffic()
    net.stop()


if __name__ == '__main__':
    setLogLevel('info')
    run_network()
