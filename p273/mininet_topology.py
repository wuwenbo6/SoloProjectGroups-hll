#!/usr/bin/env python
from mininet.topo import Topo
from mininet.net import Mininet
from mininet.node import Controller, RemoteController, OVSKernelSwitch
from mininet.cli import CLI
from mininet.log import setLogLevel, info
from mininet.link import TCLink
import time
import argparse


class SingleSwitchTopo(Topo):
    def build(self, n=2):
        switch = self.addSwitch('s1', protocols='OpenFlow13')

        for h in range(n):
            host = self.addHost('h%s' % (h + 1))
            self.addLink(host, switch, cls=TCLink, bw=100, delay='1ms')


def run_traffic_test(net, duration=60, bandwidth=10):
    info('*** Starting traffic test\n')

    h1 = net.get('h1')
    h2 = net.get('h2')

    info('*** h1 IP: %s\n' % h1.IP())
    info('*** h2 IP: %s\n' % h2.IP())

    info('*** Starting iperf server on h2\n')
    h2.cmd('iperf -s &')
    time.sleep(2)

    info('*** Starting iperf client on h1, bandwidth: %d Mbps, duration: %d sec\n' % (bandwidth, duration))
    h1.cmd('iperf -c %s -t %d -b %dM &' % (h2.IP(), duration, bandwidth))

    info('*** Traffic test started. Use CLI to interact.\n')
    info('*** Commands:\n')
    info('    - h1 ping h2: test connectivity\n')
    info('    - h1 iperf -c h2 -t 10 -b 5M: generate 5Mbps traffic\n')
    info('    - sh ovs-ofctl dump-flows s1: view flow table\n')
    info('    - sh ovs-ofctl meter-stats s1: view meter stats\n')


def main():
    parser = argparse.ArgumentParser(description='Mininet topology for OpenFlow Meter testing')
    parser.add_argument('--hosts', type=int, default=2, help='Number of hosts')
    parser.add_argument('--controller-ip', type=str, default='127.0.0.1', help='Controller IP')
    parser.add_argument('--controller-port', type=int, default=6633, help='Controller port')
    parser.add_argument('--test', action='store_true', help='Run automatic traffic test')
    parser.add_argument('--duration', type=int, default=60, help='Traffic test duration in seconds')
    parser.add_argument('--bandwidth', type=int, default=10, help='Traffic bandwidth in Mbps')

    args = parser.parse_args()

    setLogLevel('info')

    topo = SingleSwitchTopo(n=args.hosts)

    net = Mininet(
        topo=topo,
        switch=OVSKernelSwitch,
        controller=RemoteController(
            'c0',
            ip=args.controller_ip,
            port=args.controller_port
        ),
        autoSetMacs=True,
        autoStaticArp=True
    )

    info('*** Starting network\n')
    net.start()

    info('*** Waiting for controller connection\n')
    time.sleep(3)

    s1 = net.get('s1')
    info('*** Switch connected to controller: %s\n' % s1.connected())

    if args.test:
        run_traffic_test(net, duration=args.duration, bandwidth=args.bandwidth)

    info('*** Running CLI\n')
    CLI(net)

    info('*** Stopping network\n')
    net.stop()


if __name__ == '__main__':
    main()
