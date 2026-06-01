#include "sqlids.h"
#include <ctype.h>

int is_http_request(const uint8_t *payload, int len) {
    if (len < 5) return 0;

    const char *methods[] = {"GET ", "POST ", "PUT ", "DELETE ", "PATCH ", "HEAD ", "OPTIONS "};
    int num_methods = sizeof(methods) / sizeof(methods[0]);

    for (int i = 0; i < num_methods; i++) {
        size_t method_len = strlen(methods[i]);
        if ((size_t)len >= method_len && memcmp(payload, methods[i], method_len) == 0) {
            return 1;
        }
    }
    return 0;
}

int parse_http_request(const uint8_t *payload, int len, char *method, char *uri, char *body) {
    memset(method, 0, 16);
    memset(uri, 0, 4096);
    memset(body, 0, MAX_PAYLOAD);

    char *buf = malloc(len + 1);
    if (!buf) return -1;
    memcpy(buf, payload, len);
    buf[len] = '\0';

    char *line_end = strstr(buf, "\r\n");
    if (!line_end) {
        free(buf);
        return -1;
    }

    *line_end = '\0';
    char *first_line = buf;

    char *p = strtok(first_line, " ");
    if (p) {
        strncpy(method, p, 15);
        method[15] = '\0';
    } else {
        free(buf);
        return -1;
    }

    p = strtok(NULL, " ");
    if (p) {
        strncpy(uri, p, 4095);
        uri[4095] = '\0';
    } else {
        free(buf);
        return -1;
    }

    char *body_start = strstr(line_end + 2, "\r\n\r\n");
    if (body_start) {
        int body_len = len - (body_start + 4 - buf);
        if (body_len > 0 && body_len < MAX_PAYLOAD) {
            memcpy(body, body_start + 4, body_len);
            body[body_len] = '\0';
        }
    }

    free(buf);
    return 0;
}

static int hex_to_int(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    return 0;
}

void url_decode(const char *src, char *dst, int dst_len) {
    int i = 0, j = 0;
    int src_len = strlen(src);

    while (i < src_len && j < dst_len - 1) {
        if (src[i] == '%' && i + 2 < src_len) {
            dst[j++] = (hex_to_int(src[i+1]) << 4) | hex_to_int(src[i+2]);
            i += 3;
        } else if (src[i] == '+') {
            dst[j++] = ' ';
            i++;
        } else {
            dst[j++] = src[i++];
        }
    }
    dst[j] = '\0';
}
