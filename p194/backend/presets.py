PRESETS = [
    {
        "name": "基本以太帧封装",
        "description": "将一个简单的以太帧封装到 VXLAN GPE 隧道中，Next Protocol = Ethernet (3)",
        "encapsulate_request": {
            "eth": {
                "dst": "aa:bb:cc:dd:ee:ff",
                "src": "11:22:33:44:55:66",
                "type": 2048,
            },
            "payload": "deadbeef01020304",
            "outer_ip": {
                "src": "10.0.0.1",
                "dst": "10.0.0.2",
            },
            "vni": 100,
            "next_protocol": 3,
            "udp_src_port": 50000,
            "udp_dst_port": 4790,
        },
    },
    {
        "name": "IPv4 内层协议",
        "description": "VXLAN GPE 携带 IPv4 内层协议，Next Protocol = IPv4 (1)",
        "encapsulate_request": {
            "eth": {
                "dst": "ff:ff:ff:ff:ff:ff",
                "src": "00:11:22:33:44:55",
                "type": 2048,
            },
            "payload": "4500001c0001000040010000c0a80001c0a80002" + "00000000",
            "outer_ip": {
                "src": "192.168.1.1",
                "dst": "192.168.1.2",
            },
            "vni": 5000,
            "next_protocol": 1,
            "udp_src_port": 12345,
            "udp_dst_port": 4790,
        },
    },
    {
        "name": "NSH 服务链封装",
        "description": "VXLAN GPE 携带 NSH 服务链头部 (md_type=1, 固定长度上下文)，Next Protocol = NSH (4)",
        "encapsulate_request": {
            "eth": {
                "dst": "aa:aa:aa:aa:aa:aa",
                "src": "bb:bb:bb:bb:bb:bb",
                "type": 2048,
            },
            "payload": "0123456789abcdef",
            "outer_ip": {
                "src": "172.16.0.1",
                "dst": "172.16.0.2",
            },
            "vni": 999,
            "next_protocol": 4,
            "udp_src_port": 60000,
            "udp_dst_port": 4790,
            "nsh": {
                "ver": 0,
                "oam": 0,
                "md_type": 1,
                "next_protocol": 3,
                "spi": 256,
                "si": 255,
                "context_platform": 0,
                "context_shared": 0,
                "context_service_index": 0,
                "context_reserved": 0,
            },
        },
    },
    {
        "name": "NSH 可变长度上下文",
        "description": "VXLAN GPE + NSH md_type=2 (可变长度 TLV)，无上下文头，直接承载以太帧",
        "encapsulate_request": {
            "eth": {
                "dst": "cc:dd:ee:ff:00:11",
                "src": "22:33:44:55:66:77",
                "type": 2048,
            },
            "payload": "cafebabe",
            "outer_ip": {
                "src": "192.168.100.1",
                "dst": "192.168.100.2",
            },
            "vni": 2000,
            "next_protocol": 4,
            "udp_src_port": 43210,
            "udp_dst_port": 4790,
            "nsh": {
                "ver": 0,
                "oam": 0,
                "md_type": 2,
                "next_protocol": 3,
                "spi": 512,
                "si": 128,
            },
        },
    },
]
