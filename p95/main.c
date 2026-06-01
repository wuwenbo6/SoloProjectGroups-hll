#include "sqlids.h"
#include <getopt.h>
#include <signal.h>

static sqlids_config_t global_config;

void print_usage(const char *prog) {
    printf("SQL Injection Detection System (SQLIDS)\n");
    printf("Usage: %s [options]\n\n", prog);
    printf("Options:\n");
    printf("  -i, --interface    Network interface to capture (default: any)\n");
    printf("  -p, --port         HTTP port to monitor (default: 80)\n");
    printf("  -l, --log          Log file path (default: stdout)\n");
    printf("  -d, --db           Database file path (default: sqlids.db)\n");
    printf("  -w, --whitelist    Whitelist file path\n");
    printf("  -b, --block        Enable blocking mode (send RST packets)\n");
    printf("  -m, --ml           Enable machine learning anomaly detection\n");
    printf("  -t, --threshold    Anomaly threshold (default: 0.7)\n");
    printf("  -W, --web          Enable web management interface\n");
    printf("  -P, --web-port     Web interface port (default: 8080)\n");
    printf("  -v, --verbose      Enable verbose output\n");
    printf("  -h, --help         Show this help message\n\n");
    printf("Examples:\n");
    printf("  %s -i eth0 -p 8080 -b -W\n", prog);
    printf("  %s -i any -w whitelist.txt -m -W -P 8081\n", prog);
}

int init_config(sqlids_config_t *config) {
    memset(config, 0, sizeof(sqlids_config_t));
    strcpy(config->interface, "any");
    strcpy(config->db_file, "sqlids.db");
    config->port = 80;
    config->web_port = DEFAULT_WEB_PORT;
    config->web_enabled = 0;
    config->verbose = 0;
    config->block_mode = 0;
    config->ml_enabled = 0;
    config->anomaly_threshold = ANOMALY_THRESHOLD;
    config->whitelist_count = 0;
    config->pattern_count = 0;
    config->handle = NULL;
    config->log_fp = stdout;
    config->db = NULL;
    config->running = 0;
    ml_init(&config->ml_model);
    return 0;
}

void free_config(sqlids_config_t *config) {
    web_server_stop(config);

    if (config->handle) {
        pcap_close(config->handle);
        config->handle = NULL;
    }
    if (config->log_fp && config->log_fp != stdout) {
        fclose(config->log_fp);
        config->log_fp = NULL;
    }
    if (config->stream_table) {
        stream_table_cleanup(config->stream_table);
        config->stream_table = NULL;
    }
    db_close(config);
    ml_free(&config->ml_model);
    free_patterns(config);
}

int parse_arguments(int argc, char *argv[], sqlids_config_t *config) {
    static struct option long_options[] = {
        {"interface", required_argument, 0, 'i'},
        {"port", required_argument, 0, 'p'},
        {"log", required_argument, 0, 'l'},
        {"db", required_argument, 0, 'd'},
        {"whitelist", required_argument, 0, 'w'},
        {"block", no_argument, 0, 'b'},
        {"ml", no_argument, 0, 'm'},
        {"threshold", required_argument, 0, 't'},
        {"web", no_argument, 0, 'W'},
        {"web-port", required_argument, 0, 'P'},
        {"verbose", no_argument, 0, 'v'},
        {"help", no_argument, 0, 'h'},
        {0, 0, 0, 0}
    };

    int opt;
    while ((opt = getopt_long(argc, argv, "i:p:l:d:w:mt:WP:bvh", long_options, NULL)) != -1) {
        switch (opt) {
            case 'i':
                strncpy(config->interface, optarg, sizeof(config->interface) - 1);
                break;
            case 'p':
                config->port = atoi(optarg);
                break;
            case 'l':
                strncpy(config->log_file, optarg, sizeof(config->log_file) - 1);
                config->log_fp = fopen(optarg, "a");
                if (!config->log_fp) {
                    perror("Cannot open log file");
                    config->log_fp = stdout;
                }
                break;
            case 'd':
                strncpy(config->db_file, optarg, sizeof(config->db_file) - 1);
                break;
            case 'w':
                if (load_whitelist(config, optarg) != 0) {
                    fprintf(stderr, "Warning: Cannot load whitelist from %s\n", optarg);
                }
                break;
            case 'b':
                config->block_mode = 1;
                break;
            case 'm':
                config->ml_enabled = 1;
                break;
            case 't':
                config->anomaly_threshold = atof(optarg);
                break;
            case 'W':
                config->web_enabled = 1;
                break;
            case 'P':
                config->web_port = atoi(optarg);
                break;
            case 'v':
                config->verbose = 1;
                break;
            case 'h':
                print_usage(argv[0]);
                exit(0);
            default:
                print_usage(argv[0]);
                return -1;
        }
    }
    return 0;
}

void signal_handler(int sig) {
    (void)sig;
    log_message(&global_config, "INFO", "Received shutdown signal, exiting...");
    free_config(&global_config);
    exit(0);
}

int main(int argc, char *argv[]) {
    if (getuid() != 0) {
        fprintf(stderr, "Warning: This program requires root privileges to capture packets\n");
    }

    if (init_config(&global_config) != 0) {
        fprintf(stderr, "Failed to initialize config\n");
        return 1;
    }

    if (parse_arguments(argc, argv, &global_config) != 0) {
        free_config(&global_config);
        return 1;
    }

    if (init_sqli_detection(&global_config) != 0) {
        fprintf(stderr, "Failed to initialize SQL injection detection\n");
        free_config(&global_config);
        return 1;
    }

    if (db_init(&global_config, global_config.db_file) != 0) {
        fprintf(stderr, "Warning: Failed to initialize database\n");
    }

    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    log_message(&global_config, "INFO", "SQLIDS starting...");
    log_message(&global_config, "INFO", "Interface: %s", global_config.interface);
    log_message(&global_config, "INFO", "Port: %d", global_config.port);
    log_message(&global_config, "INFO", "Database: %s", global_config.db_file);
    log_message(&global_config, "INFO", "Block mode: %s", global_config.block_mode ? "ON" : "OFF");
    log_message(&global_config, "INFO", "ML detection: %s", global_config.ml_enabled ? "ON" : "OFF");
    if (global_config.ml_enabled) {
        log_message(&global_config, "INFO", "Anomaly threshold: %.2f", global_config.anomaly_threshold);
    }
    log_message(&global_config, "INFO", "Web interface: %s", global_config.web_enabled ? "ON" : "OFF");
    if (global_config.web_enabled) {
        log_message(&global_config, "INFO", "Web port: %d", global_config.web_port);
    }
    log_message(&global_config, "INFO", "Whitelist entries: %d", global_config.whitelist_count);
    log_message(&global_config, "INFO", "SQLi patterns loaded: %d", global_config.pattern_count);

    web_server_start(&global_config);

    if (init_capture(&global_config) != 0) {
        fprintf(stderr, "Failed to initialize capture\n");
        free_config(&global_config);
        return 1;
    }

    start_capture(&global_config);
    free_config(&global_config);
    return 0;
}
