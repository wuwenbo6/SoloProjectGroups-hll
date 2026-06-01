#include "sqlids.h"

stream_table_t *stream_table_init(sqlids_config_t *config) {
    stream_table_t *table = malloc(sizeof(stream_table_t));
    if (!table) return NULL;

    memset(table, 0, sizeof(stream_table_t));
    table->config = config;
    table->count = 0;

    return table;
}

void stream_free(tcp_stream_t *stream) {
    if (!stream) return;

    tcp_segment_t *seg = stream->segments;
    while (seg) {
        tcp_segment_t *next = seg->next;
        if (seg->data) free(seg->data);
        free(seg);
        seg = next;
    }
    stream->segments = NULL;

    if (stream->buffer) {
        free(stream->buffer);
        stream->buffer = NULL;
    }

    memset(stream, 0, sizeof(tcp_stream_t));
}

void stream_table_cleanup(stream_table_t *table) {
    if (!table) return;

    for (int i = 0; i < table->count; i++) {
        stream_free(&table->streams[i]);
    }

    free(table);
}

static int stream_match(const tcp_stream_t *stream, struct in_addr src_ip, struct in_addr dst_ip,
                         uint16_t src_port, uint16_t dst_port) {
    if ((stream->src_ip.s_addr == src_ip.s_addr &&
         stream->dst_ip.s_addr == dst_ip.s_addr &&
         stream->src_port == src_port &&
         stream->dst_port == dst_port) ||
        (stream->src_ip.s_addr == dst_ip.s_addr &&
         stream->dst_ip.s_addr == src_ip.s_addr &&
         stream->src_port == dst_port &&
         stream->dst_port == src_port)) {
        return 1;
    }
    return 0;
}

tcp_stream_t *stream_get_or_create(stream_table_t *table, struct in_addr src_ip, struct in_addr dst_ip,
                                    uint16_t src_port, uint16_t dst_port) {
    for (int i = 0; i < table->count; i++) {
        if (stream_match(&table->streams[i], src_ip, dst_ip, src_port, dst_port)) {
            table->streams[i].last_seen = time(NULL);
            return &table->streams[i];
        }
    }

    if (table->count >= MAX_STREAMS) {
        stream_table_check_timeout(table);
        if (table->count >= MAX_STREAMS) {
            return NULL;
        }
    }

    tcp_stream_t *stream = &table->streams[table->count++];
    memset(stream, 0, sizeof(tcp_stream_t));

    stream->src_ip = src_ip;
    stream->dst_ip = dst_ip;
    stream->src_port = src_port;
    stream->dst_port = dst_port;
    stream->last_seen = time(NULL);
    stream->next_seq = 0;
    stream->buffer_size = 8192;
    stream->buffer = malloc(stream->buffer_size);

    if (!stream->buffer) {
        table->count--;
        return NULL;
    }

    memset(stream->buffer, 0, stream->buffer_size);

    return stream;
}

static int seq_compare(uint32_t a, uint32_t b) {
    return (int32_t)(a - b);
}

int stream_add_segment(tcp_stream_t *stream, uint32_t seq, const uint8_t *data, int len) {
    if (!stream || !data || len <= 0) return -1;

    tcp_segment_t *seg = malloc(sizeof(tcp_segment_t));
    if (!seg) return -1;

    seg->seq = seq;
    seg->len = len;
    seg->data = malloc(len);
    if (!seg->data) {
        free(seg);
        return -1;
    }
    memcpy(seg->data, data, len);
    seg->next = NULL;

    if (!stream->segments || seq_compare(seq, stream->segments->seq) < 0) {
        seg->next = stream->segments;
        stream->segments = seg;
    } else {
        tcp_segment_t *curr = stream->segments;
        while (curr->next && seq_compare(seq, curr->next->seq) > 0) {
            curr = curr->next;
        }
        seg->next = curr->next;
        curr->next = seg;
    }

    return 0;
}

int stream_reassemble(tcp_stream_t *stream) {
    if (!stream || !stream->segments) return 0;

    int total_len = 0;
    tcp_segment_t *seg = stream->segments;

    while (seg) {
        if (total_len + seg->len > MAX_STREAM_BUFFER) {
            stream_free(stream);
            return -1;
        }

        if ((uint32_t)(total_len + seg->len) >= (uint32_t)stream->buffer_size) {
            int new_size = stream->buffer_size * 2;
            while ((uint32_t)new_size < (uint32_t)(total_len + seg->len)) new_size *= 2;
            uint8_t *new_buf = realloc(stream->buffer, new_size);
            if (!new_buf) return -1;
            stream->buffer = new_buf;
            stream->buffer_size = new_size;
        }

        memcpy(stream->buffer + total_len, seg->data, seg->len);
        total_len += seg->len;
        seg = seg->next;
    }

    stream->buffer_len = total_len;
    return total_len;
}

void stream_table_check_timeout(stream_table_t *table) {
    if (!table) return;

    time_t now = time(NULL);
    int write_idx = 0;

    for (int i = 0; i < table->count; i++) {
        if (now - table->streams[i].last_seen < STREAM_TIMEOUT) {
            if (i != write_idx) {
                memcpy(&table->streams[write_idx], &table->streams[i], sizeof(tcp_stream_t));
            }
            write_idx++;
        } else {
            stream_free(&table->streams[i]);
        }
    }

    table->count = write_idx;
}
