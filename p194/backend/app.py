import sys
import os
import json
import base64
from flask import Flask, request, jsonify, Response
from flask_cors import CORS

sys.path.insert(0, os.path.dirname(__file__))

from layer_parser import build_encapsulated_frame, decapsulate_frame, export_pcap
from presets import PRESETS

app = Flask(__name__)
CORS(app)


@app.route("/api/encapsulate", methods=["POST"])
def encapsulate():
    data = request.get_json()
    try:
        eth = data["eth"]
        payload_hex = data["payload"]
        outer_ip = data["outer_ip"]
        vni = data["vni"]
        next_protocol = data.get("next_protocol", 0)
        udp_src_port = data.get("udp_src_port", 0)
        udp_dst_port = data.get("udp_dst_port", 4790)
        nsh = data.get("nsh")

        pkt, layers = build_encapsulated_frame(
            eth_dst=eth["dst"],
            eth_src=eth["src"],
            eth_type=eth["type"],
            payload_hex=payload_hex,
            outer_ip_src=outer_ip["src"],
            outer_ip_dst=outer_ip["dst"],
            vni=vni,
            next_protocol=next_protocol,
            udp_src_port=udp_src_port,
            udp_dst_port=udp_dst_port,
            nsh=nsh,
        )

        raw_hex = bytes(pkt).hex()
        return jsonify({"layers": layers, "raw_hex": raw_hex})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/export_pcap", methods=["POST"])
def export_pcap_route():
    data = request.get_json()
    try:
        eth = data["eth"]
        payload_hex = data["payload"]
        outer_ip = data["outer_ip"]
        vni = data["vni"]
        next_protocol = data.get("next_protocol", 0)
        udp_src_port = data.get("udp_src_port", 0)
        udp_dst_port = data.get("udp_dst_port", 4790)
        nsh = data.get("nsh")

        pkt, _ = build_encapsulated_frame(
            eth_dst=eth["dst"],
            eth_src=eth["src"],
            eth_type=eth["type"],
            payload_hex=payload_hex,
            outer_ip_src=outer_ip["src"],
            outer_ip_dst=outer_ip["dst"],
            vni=vni,
            next_protocol=next_protocol,
            udp_src_port=udp_src_port,
            udp_dst_port=udp_dst_port,
            nsh=nsh,
        )

        pcap_bytes = export_pcap(pkt)
        return Response(
            pcap_bytes,
            mimetype="application/vnd.tcpdump.pcap",
            headers={"Content-Disposition": "attachment; filename=vxlan_gpe.pcap"},
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/decapsulate", methods=["POST"])
def decapsulate():
    data = request.get_json()
    try:
        raw_hex = data["raw_hex"]
        layers, inner_eth, nsh_info = decapsulate_frame(raw_hex)
        result = {"layers": layers}
        if inner_eth:
            result["inner_ethernet"] = inner_eth
        if nsh_info:
            result["nsh"] = nsh_info
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/presets", methods=["GET"])
def presets():
    return jsonify(PRESETS)


if __name__ == "__main__":
    app.run(debug=True, port=5100)
