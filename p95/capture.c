#include "sqlids.h"

static int detect_stream_sqli(sqlids_config_t *config, tcp_stream_t *stream,
                              struct in_addr src_ip, struct in_addr dst_ip,
                              uint16_t src_port, uint16_t dst_port,
                              uint32_t seq, uint32_t ack) {
    if (stream->buffer_len <= 0) return 0;

    if (!is_http_request(stream->buffer, stream->buffer_len)) {
        return 0;
    }

    char method[16], uri[4096], body[MAX_PAYLOAD];
    if (parse_http_request(stream->buffer, stream->buffer_len, method, uri, body) != 0) {
        return 0;
    }

    char decoded_uri[4096], decoded_body[MAX_PAYLOAD];
    url_decode(uri, decoded_uri, sizeof(decoded_uri));
    url_decode(body, decoded_body, sizeof(decoded_body));

    if (config->verbose) {
        log_message(config, "DEBUG", "HTTP %s %s from %s:%d (stream reassembled, %d bytes)",
                    method, decoded_uri, inet_ntoa(src_ip), src_port, stream->buffer_len);
    }

    detection_result_t result_uri, result_body;
    int sqli_uri = detect_sqli_full(config, decoded_uri, &result_uri);
    int sqli_body = detect_sqli_full(config, decoded_body, &result_body);

    if (sqli_uri || sqli_body) {
        detection_result_t *result = sqli_uri ? &result_uri : &result_body;
        double total_score = sqli_uri ? result->total_score : result_body.total_score;
        double anomaly_score = sqli_uri ? result->anomaly_score : result_body.anomaly_score;
        double regex_score = sqli_uri ? result->regex_score : result_body.regex_score;

        log_message(config, "ALERT", "SQL Injection detected from %s:%d -> %s:%d",
                    inet_ntoa(src_ip), src_port,
                    inet_ntoa(dst_ip), dst_port);
        log_message(config, "ALERT", "  Method: %s", method);
        log_message(config, "ALERT", "  URI: %s", decoded_uri);
        log_message(config, "ALERT", "  Total Score: %.2f (regex: %.2f, anomaly: %.2f)",
                    total_score, regex_score, anomaly_score);
        log_message(config, "ALERT", "  Details: %s", result->details);
        if (strlen(decoded_body) > 0) {
            log_message(config, "ALERT", "  Body: %.512s", decoded_body);
        }

        if (config->db) {
            alert_record_t record;
            memset(&record, 0, sizeof(record));
            record.timestamp = time(NULL);
            strncpy(record.src_ip, inet_ntoa(src_ip), sizeof(record.src_ip) - 1);
            strncpy(record.dst_ip, inet_ntoa(dst_ip), sizeof(record.dst_ip) - 1);
            record.src_port = src_port;
            record.dst_port = dst_port;
            strncpy(record.method, method, sizeof(record.method) - 1);
            strncpy(record.uri, decoded_uri, sizeof(record.uri) - 1);
            strncpy(record.body, decoded_body, sizeof(record.body) - 1);
            record.anomaly_score = anomaly_score;
            record.regex_score = regex_score;
            record.total_score = total_score;
            record.blocked = config->block_mode ? 1 : 0;
            strncpy(record.details, result->details, sizeof(record.details) - 1);
            db_insert_alert(config, &record);
        }

        if (config->block_mode) {
            packet_info_t pkt;
            pkt.src_ip = src_ip;
            pkt.dst_ip = dst_ip;
            pkt.src_port = src_port;
            pkt.dst_port = dst_port;
            pkt.seq = seq;
            pkt.ack = ack;
            pkt.payload = stream->buffer;
            pkt.payload_len = stream->buffer_len;

            if (send_rst_packet(config, &pkt) == 0) {
                log_message(config, "INFO", "RST packet sent to block connection");
            } else {
                log_message(config, "ERROR", "Failed to send RST packet");
            }
        }

        stream->detected = 1;
        return 1;
    }

    return 0;
}

int init_capture(sqlids_config_t *config) {
    char errbuf[PCAP_ERRBUF_SIZE];
    char filter_exp[128];

    config->stream_table = stream_table_init(config);
    if (!config->stream_table) {
        fprintf(stderr, "Failed to initialize stream table\n");
        return -1;
    }
    config->last_cleanup = time(NULL);

    config->handle = pcap_open_live(config->interface, BUFSIZ, 1, 1000, errbuf);
    if (config->handle == NULL) {
        fprintf(stderr, "Could not open device %s: %s\n", config->interface, errbuf);
        return -1;
    }

    snprintf(filter_exp, sizeof(filter_exp), "tcp port %d", config->port);
    struct bpf_program fp;
    bpf_u_int32 net;
    bpf_u_int32 mask;

    if (pcap_lookupnet(config->interface, &net, &mask, errbuf) == -1) {
        net = 0;
        mask = 0;
    }

    if (pcap_compile(config->handle, &fp, filter_exp, 0, net) == -1) {
        fprintf(stderr, "Could not parse filter %s: %s\n", filter_exp, pcap_geterr(config->handle));
        return -1;
    }

    if (pcap_setfilter(config->handle, &fp) == -1) {
        fprintf(stderr, "Could not install filter %s: %s\n", filter_exp, pcap_geterr(config->handle));
        return -1;
    }

    return 0;
}

void start_capture(sqlids_config_t *config) {
    pcap_loop(config->handle, -1, packet_handler, (u_char *)config);
}

void packet_handler(u_char *user, const struct pcap_pkthdr *hdr, const u_char *packet) {
    sqlids_config_t *config = (sqlids_config_t *)user;
    (void)hdr;

    time_t now = time(NULL);
    if (now - config->last_cleanup > 10) {
        stream_table_check_timeout(config->stream_table);
        config->last_cleanup = now;
    }

    struct ether_header *eth = (struct ether_header *)packet;
    if (ntohs(eth->ether_type) != ETHERTYPE_IP) {
        return;
    }

    struct ip *ip_hdr = (struct ip *)(packet + sizeof(struct ether_header));
    if (ip_hdr->ip_p != IPPROTO_TCP) {
        return;
    }

    int ip_header_len = ip_hdr->ip_hl * 4;
    struct tcphdr *tcp_hdr = (struct tcphdr *)((u_char *)ip_hdr + ip_header_len);
    int tcp_header_len = tcp_hdr->th_off * 4;

    u_char *payload = (u_char *)tcp_hdr + tcp_header_len;
    int payload_len = ntohs(ip_hdr->ip_len) - ip_header_len - tcp_header_len;

    uint16_t src_port = ntohs(tcp_hdr->th_sport);
    uint16_t dst_port = ntohs(tcp_hdr->th_dport);

    if (is_whitelisted(config, ip_hdr->ip_src, src_port) ||
        is_whitelisted(config, ip_hdr->ip_dst, dst_port)) {
        return;
    }

    tcp_stream_t *stream = stream_get_or_create(config->stream_table,
                                                 ip_hdr->ip_src, ip_hdr->ip_dst,
                                                 src_port, dst_port);
    if (!stream) {
        return;
    }

    if (stream->detected) {
        return;
    }

    if (payload_len > 0) {
        uint32_t seq = ntohl(tcp_hdr->th_seq);
        stream_add_segment(stream, seq, payload, payload_len);
        stream_reassemble(stream);

        if (stream->buffer_len > 0) {
            detect_stream_sqli(config, stream,
                               ip_hdr->ip_src, ip_hdr->ip_dst,
                               src_port, dst_port,
                               ntohl(tcp_hdr->th_seq), ntohl(tcp_hdr->th_ack));
        }
    }

    if (tcp_hdr->th_flags & (TH_FIN | TH_RST)) {
        if (stream->buffer_len > 0 && !stream->detected) {
            detect_stream_sqli(config, stream,
                               ip_hdr->ip_src, ip_hdr->ip_dst,
                               src_port, dst_port,
                               ntohl(tcp_hdr->th_seq), ntohl(tcp_hdr->th_ack));
        }
        stream->detected = 1;
    }
}
