#include "sqlids.h"
#include <stdarg.h>
#include <ctype.h>

void log_message(sqlids_config_t *config, const char *level, const char *fmt, ...) {
    if (!config->log_fp) return;

    time_t now = time(NULL);
    struct tm *tm_info = localtime(&now);
    char time_buf[64];
    strftime(time_buf, sizeof(time_buf), "%Y-%m-%d %H:%M:%S", tm_info);

    va_list args;
    va_start(args, fmt);
    char msg_buf[MAX_LOG_SIZE];
    vsnprintf(msg_buf, sizeof(msg_buf), fmt, args);
    va_end(args);

    fprintf(config->log_fp, "[%s] [%s] %s\n", time_buf, level, msg_buf);
    fflush(config->log_fp);

    if (config->verbose && config->log_fp != stdout) {
        printf("[%s] [%s] %s\n", time_buf, level, msg_buf);
    }
}

int load_whitelist(sqlids_config_t *config, const char *filename) {
    FILE *fp = fopen(filename, "r");
    if (!fp) {
        return -1;
    }

    char line[256];
    while (fgets(line, sizeof(line), fp) && config->whitelist_count < MAX_WHITELIST) {
        char *p = strchr(line, '#');
        if (p) *p = '\0';

        char *ip = strtok(line, " \t\n\r");
        if (!ip || strlen(ip) == 0) continue;

        char *port_str = strtok(NULL, " \t\n\r");
        int port = port_str ? atoi(port_str) : 0;

        strncpy(config->whitelist[config->whitelist_count].ip, ip, 15);
        config->whitelist[config->whitelist_count].port = port;
        config->whitelist_count++;
    }

    fclose(fp);
    return 0;
}

int is_whitelisted(sqlids_config_t *config, struct in_addr ip, int port) {
    char ip_str[16];
    strcpy(ip_str, inet_ntoa(ip));

    for (int i = 0; i < config->whitelist_count; i++) {
        if (strcmp(config->whitelist[i].ip, ip_str) == 0) {
            if (config->whitelist[i].port == 0 || config->whitelist[i].port == port) {
                return 1;
            }
        }
    }
    return 0;
}
