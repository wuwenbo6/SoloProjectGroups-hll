#!/usr/bin/env python
import requests
import time
import json
import subprocess
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from topology import GroupTestTopo
from mininet.net import Mininet
from mininet.node import RemoteController, OVSKernelSwitch
from mininet.log import setLogLevel, info
from mininet.cli import CLI
from mininet.util import dumpNodeConnections


CONTROLLER_API = 'http://127.0.0.1:8080'


def start_mininet():
    info('*** Starting Mininet topology\n')
    topo = GroupTestTopo(n_hosts=4)
    net = Mininet(
        topo=topo,
        switch=OVSKernelSwitch,
        controller=lambda name: RemoteController(name, ip='127.0.0.1', port=6653),
        autoSetMacs=True
    )
    net.start()
    time.sleep(3)
    dumpNodeConnections(net.hosts)
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

    h1.cmd('iperf -c 10.0.0.2 -p 5001 -t %d -P 3 -b 100M &' % duration)
    h1.cmd('iperf -c 10.0.0.3 -p 5001 -t %d -P 3 -b 100M &' % duration)
    h1.cmd('iperf -c 10.0.0.4 -p 5001 -t %d -P 3 -b 100M &' % duration)


def reset_flows():
    try:
        requests.post('%s/api/reset' % CONTROLLER_API, timeout=5)
    except:
        pass


def start_group_test(group_type):
    info('*** Starting test for group type: %s\n' % group_type)
    try:
        response = requests.post('%s/api/test/%s' % (CONTROLLER_API, group_type), timeout=5)
        return response.json()
    except Exception as e:
        info('*** Error starting test: %s\n' % e)
        return None


def get_results():
    try:
        response = requests.get('%s/api/results' % CONTROLLER_API, timeout=5)
        return response.json()
    except Exception as e:
        info('*** Error getting results: %s\n' % e)
        return {}


def run_full_test():
    setLogLevel('info')
    net = start_mininet()

    group_types = ['all', 'indirect', 'fast_failover']
    all_results = {}

    for group_type in group_types:
        info('\n' + '=' * 50 + '\n')
        info('Testing group type: %s\n' % group_type)
        info('=' * 50 + '\n')

        reset_flows()
        time.sleep(2)

        start_group_test(group_type)
        time.sleep(1)

        generate_traffic(net, duration=12)
        time.sleep(2)

        results = get_results()
        if group_type in results:
            all_results[group_type] = results[group_type]
            info('*** Test results for %s:\n' % group_type)
            info(json.dumps(results[group_type], indent=2) + '\n')
        else:
            info('*** No results for %s\n' % group_type)

        time.sleep(3)

    info('\n' + '=' * 50 + '\n')
    info('*** All tests completed!\n')
    info('=' * 50 + '\n')

    result_file = '/tmp/group_test_results.json'
    with open(result_file, 'w') as f:
        json.dump(all_results, f, indent=2)
    info('*** Results saved to: %s\n' % result_file)

    CLI(net)
    net.stop()

    return all_results


def main():
    if not os.path.exists('/tmp/group_test_results.json'):
        run_full_test()
    else:
        info('*** Using existing results from /tmp/group_test_results.json\n')


if __name__ == '__main__':
    main()
