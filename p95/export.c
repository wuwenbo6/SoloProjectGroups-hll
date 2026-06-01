#include "sqlids.h"

static void csv_escape(char *dst, const char *src, size_t dst_len) {
    if (!src || !dst || dst_len == 0) return;

    size_t j = 0;
    int needs_quote = 0;

    for (const char *p = src; *p && j < dst_len - 3; p++) {
        if (*p == ',' || *p == '"' || *p == '\n' || *p == '\r') {
            needs_quote = 1;
            break;
        }
    }

    if (needs_quote) dst[j++] = '"';

    for (const char *p = src; *p && j < dst_len - 2; p++) {
        if (*p == '"') {
            dst[j++] = '"';
            if (j < dst_len - 2) dst[j++] = '"';
        } else {
            dst[j++] = *p;
        }
    }

    if (needs_quote && j < dst_len - 1) dst[j++] = '"';
    dst[j] = '\0';
}

int export_alerts_csv(sqlids_config_t *config, const char *filename, const char *filter) {
    if (!config->db || !filename) return -1;

    alert_record_t *alerts = NULL;
    int count = 0;

    if (db_query_alerts(config, filter, 10000, &alerts, &count) != 0) {
        return -1;
    }

    FILE *fp = fopen(filename, "w");
    if (!fp) {
        free(alerts);
        return -1;
    }

    fprintf(fp, "ID,Timestamp,Source IP,Destination IP,Source Port,Destination Port,"
                "Method,URI,Body,Anomaly Score,Regex Score,Total Score,Blocked,Details\n");

    for (int i = 0; i < count; i++) {
        alert_record_t *a = &alerts[i];

        char time_buf[64];
        struct tm *tm_info = localtime(&a->timestamp);
        strftime(time_buf, sizeof(time_buf), "%Y-%m-%d %H:%M:%S", tm_info);

        char escaped_uri[4096], escaped_body[8192], escaped_details[1024];
        csv_escape(escaped_uri, a->uri, sizeof(escaped_uri));
        csv_escape(escaped_body, a->body, sizeof(escaped_body));
        csv_escape(escaped_details, a->details, sizeof(escaped_details));

        fprintf(fp, "%lld,%s,%s,%s,%d,%d,%s,%s,%s,%.4f,%.4f,%.4f,%d,%s\n",
                (long long)a->id,
                time_buf,
                a->src_ip,
                a->dst_ip,
                a->src_port,
                a->dst_port,
                a->method,
                escaped_uri,
                escaped_body,
                a->anomaly_score,
                a->regex_score,
                a->total_score,
                a->blocked,
                escaped_details);
    }

    fclose(fp);
    free(alerts);
    log_message(config, "INFO", "Exported %d alerts to %s (CSV)", count, filename);
    return 0;
}

static void json_escape(char *dst, const char *src, size_t dst_len) {
    if (!src || !dst || dst_len == 0) return;

    size_t j = 0;
    for (const char *p = src; *p && j < dst_len - 2; p++) {
        switch (*p) {
            case '"':  dst[j++] = '\\'; dst[j++] = '"'; break;
            case '\\': dst[j++] = '\\'; dst[j++] = '\\'; break;
            case '\n': dst[j++] = '\\'; dst[j++] = 'n'; break;
            case '\r': dst[j++] = '\\'; dst[j++] = 'r'; break;
            case '\t': dst[j++] = '\\'; dst[j++] = 't'; break;
            default:
                if ((unsigned char)*p < 32) {
                    snprintf(dst + j, 7, "\\u%04x", (unsigned char)*p);
                    j += 6;
                } else {
                    dst[j++] = *p;
                }
        }
    }
    dst[j] = '\0';
}

int export_alerts_json(sqlids_config_t *config, const char *filename, const char *filter) {
    if (!config->db || !filename) return -1;

    alert_record_t *alerts = NULL;
    int count = 0;

    if (db_query_alerts(config, filter, 10000, &alerts, &count) != 0) {
        return -1;
    }

    FILE *fp = fopen(filename, "w");
    if (!fp) {
        free(alerts);
        return -1;
    }

    fprintf(fp, "{\n  \"total\": %d,\n  \"alerts\": [\n", count);

    for (int i = 0; i < count; i++) {
        alert_record_t *a = &alerts[i];

        char time_buf[64];
        struct tm *tm_info = localtime(&a->timestamp);
        strftime(time_buf, sizeof(time_buf), "%Y-%m-%d %H:%M:%S", tm_info);

        char escaped_uri[4096], escaped_body[8192], escaped_details[1024];
        json_escape(escaped_uri, a->uri, sizeof(escaped_uri));
        json_escape(escaped_body, a->body, sizeof(escaped_body));
        json_escape(escaped_details, a->details, sizeof(escaped_details));

        fprintf(fp, "    {\n");
        fprintf(fp, "      \"id\": %lld,\n", (long long)a->id);
        fprintf(fp, "      \"timestamp\": \"%s\",\n", time_buf);
        fprintf(fp, "      \"src_ip\": \"%s\",\n", a->src_ip);
        fprintf(fp, "      \"dst_ip\": \"%s\",\n", a->dst_ip);
        fprintf(fp, "      \"src_port\": %d,\n", a->src_port);
        fprintf(fp, "      \"dst_port\": %d,\n", a->dst_port);
        fprintf(fp, "      \"method\": \"%s\",\n", a->method);
        fprintf(fp, "      \"uri\": \"%s\",\n", escaped_uri);
        fprintf(fp, "      \"body\": \"%s\",\n", escaped_body);
        fprintf(fp, "      \"anomaly_score\": %.4f,\n", a->anomaly_score);
        fprintf(fp, "      \"regex_score\": %.4f,\n", a->regex_score);
        fprintf(fp, "      \"total_score\": %.4f,\n", a->total_score);
        fprintf(fp, "      \"blocked\": %s,\n", a->blocked ? "true" : "false");
        fprintf(fp, "      \"details\": \"%s\"\n", escaped_details);
        fprintf(fp, "    }%s\n", i < count - 1 ? "," : "");
    }

    fprintf(fp, "  ]\n}\n");

    fclose(fp);
    free(alerts);
    log_message(config, "INFO", "Exported %d alerts to %s (JSON)", count, filename);
    return 0;
}
