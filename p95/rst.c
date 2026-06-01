#include "sqlids.h"
#include <sys/socket.h>

struct pseudo_header {
    uint32_t source_address;
    uint32_t dest_address;
    uint8_t placeholder;
    uint8_t protocol;
    uint16_t tcp_length;
    struct tcphdr tcp;
};

uint16_t checksum(uint16_t *buf, int len) {
    uint32_t sum = 0;
    uint16_t oddbyte;

    while (len > 1) {
        sum += *buf++;
        len -= 2;
    }

    if (len == 1) {
        oddbyte = 0;
        *((uint8_t *)&oddbyte) = *(uint8_t *)buf;
        sum += oddbyte;
    }

    sum = (sum >> 16) + (sum & 0xffff);
    sum += (sum >> 16);

    return (uint16_t)(~sum);
}

static uint16_t tcp_checksum(struct ip *ip_hdr, struct tcphdr *tcp_hdr, int tcp_len) {
    struct pseudo_header psh;
    char *pseudogram;
    int psize = sizeof(struct pseudo_header) + tcp_len;

    psh.source_address = ip_hdr->ip_src.s_addr;
    psh.dest_address = ip_hdr->ip_dst.s_addr;
    psh.placeholder = 0;
    psh.protocol = IPPROTO_TCP;
    psh.tcp_length = htons(tcp_len);

    memcpy(&psh.tcp, tcp_hdr, tcp_len);

    pseudogram = malloc(psize);
    memcpy(pseudogram, &psh, sizeof(struct pseudo_header));
    memcpy(pseudogram + sizeof(struct pseudo_header), tcp_hdr + 1, tcp_len - sizeof(struct tcphdr));

    uint16_t result = checksum((uint16_t *)pseudogram, psize);
    free(pseudogram);
    return result;
}

int send_rst_packet(sqlids_config_t *config, packet_info_t *pkt) {
    (void)config;

    int sockfd = socket(AF_INET, SOCK_RAW, IPPROTO_TCP);
    if (sockfd < 0) {
        perror("socket");
        return -1;
    }

    int one = 1;
    if (setsockopt(sockfd, IPPROTO_IP, IP_HDRINCL, &one, sizeof(one)) < 0) {
        perror("setsockopt");
        close(sockfd);
        return -1;
    }

    char packet[4096];
    memset(packet, 0, sizeof(packet));

    struct ip *ip_hdr = (struct ip *)packet;
    struct tcphdr *tcp_hdr = (struct tcphdr *)(packet + sizeof(struct ip));

    ip_hdr->ip_hl = 5;
    ip_hdr->ip_v = 4;
    ip_hdr->ip_tos = 0;
    ip_hdr->ip_len = htons(sizeof(struct ip) + sizeof(struct tcphdr));
    ip_hdr->ip_id = htons(rand() % 65535);
    ip_hdr->ip_off = 0;
    ip_hdr->ip_ttl = 255;
    ip_hdr->ip_p = IPPROTO_TCP;
    ip_hdr->ip_sum = 0;
    ip_hdr->ip_src.s_addr = pkt->dst_ip.s_addr;
    ip_hdr->ip_dst.s_addr = pkt->src_ip.s_addr;

    ip_hdr->ip_sum = checksum((uint16_t *)ip_hdr, sizeof(struct ip));

    tcp_hdr->th_sport = htons(pkt->dst_port);
    tcp_hdr->th_dport = htons(pkt->src_port);
    tcp_hdr->th_seq = htonl(pkt->ack);
    tcp_hdr->th_ack = htonl(pkt->seq + pkt->payload_len);
    tcp_hdr->th_off = 5;
    tcp_hdr->th_flags = TH_RST | TH_ACK;
    tcp_hdr->th_win = htons(0);
    tcp_hdr->th_sum = 0;
    tcp_hdr->th_urp = 0;

    tcp_hdr->th_sum = tcp_checksum(ip_hdr, tcp_hdr, sizeof(struct tcphdr));

    struct sockaddr_in dest;
    dest.sin_family = AF_INET;
    dest.sin_addr.s_addr = pkt->src_ip.s_addr;
    dest.sin_port = htons(pkt->src_port);

    if (sendto(sockfd, packet, ntohs(ip_hdr->ip_len), 0,
               (struct sockaddr *)&dest, sizeof(dest)) < 0) {
        perror("sendto");
        close(sockfd);
        return -1;
    }

    tcp_hdr->th_seq = htonl(pkt->seq + pkt->payload_len);
    tcp_hdr->th_ack = htonl(pkt->ack);
    tcp_hdr->th_flags = TH_RST;

    ip_hdr->ip_src.s_addr = pkt->src_ip.s_addr;
    ip_hdr->ip_dst.s_addr = pkt->dst_ip.s_addr;
    tcp_hdr->th_sport = htons(pkt->src_port);
    tcp_hdr->th_dport = htons(pkt->dst_port);

    ip_hdr->ip_sum = 0;
    ip_hdr->ip_sum = checksum((uint16_t *)ip_hdr, sizeof(struct ip));
    tcp_hdr->th_sum = 0;
    tcp_hdr->th_sum = tcp_checksum(ip_hdr, tcp_hdr, sizeof(struct tcphdr));

    dest.sin_addr.s_addr = pkt->dst_ip.s_addr;
    dest.sin_port = htons(pkt->dst_port);

    if (sendto(sockfd, packet, ntohs(ip_hdr->ip_len), 0,
               (struct sockaddr *)&dest, sizeof(dest)) < 0) {
        perror("sendto");
        close(sockfd);
        return -1;
    }

    close(sockfd);
    return 0;
}
