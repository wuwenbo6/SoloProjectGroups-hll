#!/usr/bin/env python
from mininet.topo import Topo
from mininet.net import Mininet
from mininet.node import Controller, RemoteController, OVSKernelSwitch
from mininet.cli import CLI
from mininet.log import setLogLevel, info
from mininet.util import dumpNodeConnections
import time
import sys


class GroupTestTopo(Topo):
    def build(self, n_hosts=4):
        s1 = self.addSwitch('s1', protocols='OpenFlow13')

        for i in range(1, n_hosts + 1):
            h = self.addHost('h%s' % i, ip='10.0.0.%s/24' % i)
            self.addLink(h, s1)


def run_test():
    topo = GroupTestTopo(n_hosts=4)
    net = Mininet(
        topo=topo,
        switch=OVSKernelSwitch,
        controller=lambda name: RemoteController(name, ip='127.0.0.1', port=6653),
        autoSetMacs=True
    )

    info('*** Starting network\n')
    net.start()

    info('*** Waiting for switches to connect to controller\n')
    time.sleep(3)

    info('*** Dumping host connections\n')
    dumpNodeConnections(net.hosts)

    info('*** Testing network connectivity\n')
    net.pingAll()

    return net


def generate_traffic(net, duration=10):
    info('*** Generating traffic...\n')

    h1 = net.get('h1')
    h2 = net.get('h2')
    h3 = net.get('h3')
    h4 = net.get('h4')

    h2.cmd('iperf -s -p 5001 &')
    h3.cmd('iperf -s -p 5001 &')
    h4.cmd('iperf -s -p 5001 &')

    time.sleep(1)

    info('*** Starting traffic from h1 to multiple hosts\n')
    h1.cmd('iperf -c 10.0.0.2 -p 5001 -t %d -P 5 &' % duration)
    h1.cmd('iperf -c 10.0.0.3 -p 5001 -t %d -P 5 &' % duration)
    h1.cmd('iperf -c 10.0.0.4 -p 5001 -t %d -P 5 &' % duration)

    time.sleep(duration + 2)
    info('*** Traffic generation completed\n')


def main():
    setLogLevel('info')

    if len(sys.argv) > 1 and sys.argv[1] == 'cli':
        topo = GroupTestTopo(n_hosts=4)
        net = Mininet(
            topo=topo,
            switch=OVSKernelSwitch,
            controller=lambda name: RemoteController(name, ip='127.0.0.1', port=6653),
            autoSetMacs=True
        )
        net.start()
        time.sleep(2)
        CLI(net)
        net.stop()
    else:
        net = run_test()
        CLI(net)
        net.stop()


if __name__ == '__main__':
    main()
