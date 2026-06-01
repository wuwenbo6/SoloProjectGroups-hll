#ifndef SQLIDS_H
#define SQLIDS_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <time.h>
#include <netinet/in.h>
#include <netinet/if_ether.h>
#include <netinet/ip.h>
#include <netinet/tcp.h>
#include <arpa/inet.h>
#include <pcap.h>
#include <regex.h>
#include <sqlite3.h>

#define MAX_WHITELIST 256
#define MAX_PATTERNS 64
#define MAX_PAYLOAD 65536
#define MAX_LOG_SIZE 4096
#define MAX_STREAM_BUFFER (1024 * 1024)
#define MAX_STREAMS 1024
#define STREAM_TIMEOUT 30
#define MAX_NGRAM 4
#define ANOMALY_THRESHOLD 0.7
#define DEFAULT_WEB_PORT 8080

typedef struct {
    char ip[16];
    int port;
} whitelist_entry_t;

typedef struct {
    char *pattern;
    regex_t regex;
    const char *description;
} sqli_pattern_t;

typedef struct {
    struct in_addr src_ip;
    struct in_addr dst_ip;
    uint16_t src_port;
    uint16_t dst_port;
    uint32_t seq;
    uint32_t ack;
    uint8_t *payload;
    int payload_len;
} packet_info_t;

typedef struct tcp_segment {
    uint32_t seq;
    uint32_t len;
    uint8_t *data;
    struct tcp_segment *next;
} tcp_segment_t;

typedef struct tcp_stream {
    struct in_addr src_ip;
    struct in_addr dst_ip;
    uint16_t src_port;
    uint16_t dst_port;
    uint32_t next_seq;
    tcp_segment_t *segments;
    uint8_t *buffer;
    int buffer_len;
    int buffer_size;
    time_t last_seen;
    int detected;
} tcp_stream_t;

typedef struct stream_table {
    tcp_stream_t streams[MAX_STREAMS];
    int count;
    struct sqlids_config *config;
} stream_table_t;

typedef struct {
    double char_freq[256];
    double bigram_freq[256][256];
    double trigram_freq[256][256][256];
    int trained;
    int sample_count;
} ml_model_t;

typedef struct {
    double regex_score;
    double anomaly_score;
    double char_freq_score;
    double ngram_score;
    double special_char_ratio;
    double total_score;
    int detected;
    char details[512];
} detection_result_t;

typedef struct {
    int64_t id;
    time_t timestamp;
    char src_ip[16];
    char dst_ip[16];
    int src_port;
    int dst_port;
    char method[16];
    char uri[4096];
    char body[8192];
    double anomaly_score;
    double regex_score;
    double total_score;
    int blocked;
    char details[1024];
} alert_record_t;

typedef struct sqlids_config {
    char interface[64];
    char log_file[256];
    char db_file[256];
    int port;
    int web_port;
    int web_enabled;
    int verbose;
    int block_mode;
    int ml_enabled;
    double anomaly_threshold;
    whitelist_entry_t whitelist[MAX_WHITELIST];
    int whitelist_count;
    sqli_pattern_t patterns[MAX_PATTERNS];
    int pattern_count;
    pcap_t *handle;
    FILE *log_fp;
    stream_table_t *stream_table;
    time_t last_cleanup;
    sqlite3 *db;
    ml_model_t ml_model;
    volatile int running;
    pthread_t web_thread;
} sqlids_config_t;

int init_config(sqlids_config_t *config);
void free_config(sqlids_config_t *config);
int parse_arguments(int argc, char *argv[], sqlids_config_t *config);
int load_whitelist(sqlids_config_t *config, const char *filename);
int is_whitelisted(sqlids_config_t *config, struct in_addr ip, int port);
int load_patterns(sqlids_config_t *config);
void log_message(sqlids_config_t *config, const char *level, const char *fmt, ...);

int init_capture(sqlids_config_t *config);
void start_capture(sqlids_config_t *config);
void packet_handler(u_char *user, const struct pcap_pkthdr *hdr, const u_char *packet);

int parse_http_request(const uint8_t *payload, int len, char *method, char *uri, char *body);
int is_http_request(const uint8_t *payload, int len);
void url_decode(const char *src, char *dst, int dst_len);

int init_sqli_detection(sqlids_config_t *config);
int detect_sqli(sqlids_config_t *config, const char *data);
void free_patterns(sqlids_config_t *config);

int send_rst_packet(sqlids_config_t *config, packet_info_t *pkt);
uint16_t checksum(uint16_t *buf, int len);

stream_table_t *stream_table_init(sqlids_config_t *config);
void stream_table_cleanup(stream_table_t *table);
tcp_stream_t *stream_get_or_create(stream_table_t *table, struct in_addr src_ip, struct in_addr dst_ip,
                                    uint16_t src_port, uint16_t dst_port);
int stream_add_segment(tcp_stream_t *stream, uint32_t seq, const uint8_t *data, int len);
int stream_reassemble(tcp_stream_t *stream);
void stream_table_check_timeout(stream_table_t *table);
void stream_free(tcp_stream_t *stream);

int ml_init(ml_model_t *model);
void ml_train(ml_model_t *model, const char *data);
double ml_calculate_anomaly_score(ml_model_t *model, const char *data, detection_result_t *result);
void ml_free(ml_model_t *model);

int detect_sqli_full(sqlids_config_t *config, const char *data, detection_result_t *result);

int db_init(sqlids_config_t *config, const char *db_path);
int db_insert_alert(sqlids_config_t *config, alert_record_t *record);
int db_query_alerts(sqlids_config_t *config, const char *filter, int limit, alert_record_t **results, int *count);
int db_get_stats(sqlids_config_t *config, int *total_alerts, int *today_alerts, int *blocked_count);
void db_close(sqlids_config_t *config);

int export_alerts_csv(sqlids_config_t *config, const char *filename, const char *filter);
int export_alerts_json(sqlids_config_t *config, const char *filename, const char *filter);

void *web_server_thread(void *arg);
int web_server_start(sqlids_config_t *config);
void web_server_stop(sqlids_config_t *config);

#endif
