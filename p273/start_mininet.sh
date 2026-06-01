#!/bin/bash

echo "=========================================="
echo "Mininet Topology for Meter Testing"
echo "=========================================="
echo ""

if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (use sudo)"
    exit 1
fi

cd "$(dirname "$0")"

echo "Starting Mininet topology..."
echo ""
echo "Topology: Single switch with 2 hosts"
echo "h1 <---> s1 <---> h2"
echo ""
echo "Common commands in Mininet CLI:"
echo "  h1 ping h2          - Ping test"
echo "  h1 iperf -c h2 -t 10 -b 2M   - 2Mbps traffic (below threshold)"
echo "  h1 iperf -c h2 -t 10 -b 5M   - 5Mbps traffic (above threshold)"
echo "  sh ovs-ofctl dump-flows s1   - View flow table"
echo "  sh ovs-ofctl meter-stats s1  - View meter statistics"
echo ""

python3 mininet_topology.py "$@"
