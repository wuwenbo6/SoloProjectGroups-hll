#include "sqlids.h"

int db_init(sqlids_config_t *config, const char *db_path) {
    char *err_msg = NULL;
    int rc;

    rc = sqlite3_open(db_path, &config->db);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Cannot open database: %s\n", sqlite3_errmsg(config->db));
        sqlite3_close(config->db);
        config->db = NULL;
        return -1;
    }

    const char *create_table_sql =
        "CREATE TABLE IF NOT EXISTS alerts ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "timestamp INTEGER NOT NULL,"
        "src_ip TEXT NOT NULL,"
        "dst_ip TEXT NOT NULL,"
        "src_port INTEGER NOT NULL,"
        "dst_port INTEGER NOT NULL,"
        "method TEXT,"
        "uri TEXT,"
        "body TEXT,"
        "anomaly_score REAL,"
        "regex_score REAL,"
        "total_score REAL,"
        "blocked INTEGER DEFAULT 0,"
        "details TEXT"
        ");";

    rc = sqlite3_exec(config->db, create_table_sql, NULL, NULL, &err_msg);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "SQL error: %s\n", err_msg);
        sqlite3_free(err_msg);
        return -1;
    }

    strncpy(config->db_file, db_path, sizeof(config->db_file) - 1);
    return 0;
}

int db_insert_alert(sqlids_config_t *config, alert_record_t *record) {
    if (!config->db || !record) return -1;

    sqlite3_stmt *stmt;
    const char *sql =
        "INSERT INTO alerts (timestamp, src_ip, dst_ip, src_port, dst_port, "
        "method, uri, body, anomaly_score, regex_score, total_score, blocked, details) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";

    int rc = sqlite3_prepare_v2(config->db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Prepare failed: %s\n", sqlite3_errmsg(config->db));
        return -1;
    }

    sqlite3_bind_int64(stmt, 1, record->timestamp);
    sqlite3_bind_text(stmt, 2, record->src_ip, -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 3, record->dst_ip, -1, SQLITE_STATIC);
    sqlite3_bind_int(stmt, 4, record->src_port);
    sqlite3_bind_int(stmt, 5, record->dst_port);
    sqlite3_bind_text(stmt, 6, record->method, -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 7, record->uri, -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 8, record->body, -1, SQLITE_STATIC);
    sqlite3_bind_double(stmt, 9, record->anomaly_score);
    sqlite3_bind_double(stmt, 10, record->regex_score);
    sqlite3_bind_double(stmt, 11, record->total_score);
    sqlite3_bind_int(stmt, 12, record->blocked);
    sqlite3_bind_text(stmt, 13, record->details, -1, SQLITE_STATIC);

    rc = sqlite3_step(stmt);
    if (rc != SQLITE_DONE) {
        fprintf(stderr, "Insert failed: %s\n", sqlite3_errmsg(config->db));
        sqlite3_finalize(stmt);
        return -1;
    }

    record->id = sqlite3_last_insert_rowid(config->db);
    sqlite3_finalize(stmt);
    return 0;
}

int db_query_alerts(sqlids_config_t *config, const char *filter, int limit, alert_record_t **results, int *count) {
    if (!config->db || !results || !count) return -1;

    *results = NULL;
    *count = 0;

    char sql[1024];
    if (filter && strlen(filter) > 0) {
        snprintf(sql, sizeof(sql),
                 "SELECT id, timestamp, src_ip, dst_ip, src_port, dst_port, "
                 "method, uri, body, anomaly_score, regex_score, total_score, blocked, details "
                 "FROM alerts WHERE %s ORDER BY timestamp DESC LIMIT %d;",
                 filter, limit > 0 ? limit : 100);
    } else {
        snprintf(sql, sizeof(sql),
                 "SELECT id, timestamp, src_ip, dst_ip, src_port, dst_port, "
                 "method, uri, body, anomaly_score, regex_score, total_score, blocked, details "
                 "FROM alerts ORDER BY timestamp DESC LIMIT %d;",
                 limit > 0 ? limit : 100);
    }

    sqlite3_stmt *stmt;
    int rc = sqlite3_prepare_v2(config->db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Prepare failed: %s\n", sqlite3_errmsg(config->db));
        return -1;
    }

    int capacity = 64;
    *results = malloc(sizeof(alert_record_t) * capacity);
    if (!*results) {
        sqlite3_finalize(stmt);
        return -1;
    }

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        if (*count >= capacity) {
            capacity *= 2;
            alert_record_t *new_ptr = realloc(*results, sizeof(alert_record_t) * capacity);
            if (!new_ptr) break;
            *results = new_ptr;
        }

        alert_record_t *r = &(*results)[*count];
        memset(r, 0, sizeof(alert_record_t));

        r->id = sqlite3_column_int64(stmt, 0);
        r->timestamp = sqlite3_column_int64(stmt, 1);
        strncpy(r->src_ip, (const char *)sqlite3_column_text(stmt, 2), sizeof(r->src_ip) - 1);
        strncpy(r->dst_ip, (const char *)sqlite3_column_text(stmt, 3), sizeof(r->dst_ip) - 1);
        r->src_port = sqlite3_column_int(stmt, 4);
        r->dst_port = sqlite3_column_int(stmt, 5);
        const char *method = (const char *)sqlite3_column_text(stmt, 6);
        if (method) strncpy(r->method, method, sizeof(r->method) - 1);
        const char *uri = (const char *)sqlite3_column_text(stmt, 7);
        if (uri) strncpy(r->uri, uri, sizeof(r->uri) - 1);
        const char *body = (const char *)sqlite3_column_text(stmt, 8);
        if (body) strncpy(r->body, body, sizeof(r->body) - 1);
        r->anomaly_score = sqlite3_column_double(stmt, 9);
        r->regex_score = sqlite3_column_double(stmt, 10);
        r->total_score = sqlite3_column_double(stmt, 11);
        r->blocked = sqlite3_column_int(stmt, 12);
        const char *details = (const char *)sqlite3_column_text(stmt, 13);
        if (details) strncpy(r->details, details, sizeof(r->details) - 1);

        (*count)++;
    }

    sqlite3_finalize(stmt);
    return 0;
}

int db_get_stats(sqlids_config_t *config, int *total_alerts, int *today_alerts, int *blocked_count) {
    if (!config->db) return -1;

    sqlite3_stmt *stmt;

    if (total_alerts) {
        *total_alerts = 0;
        const char *sql = "SELECT COUNT(*) FROM alerts;";
        if (sqlite3_prepare_v2(config->db, sql, -1, &stmt, NULL) == SQLITE_OK) {
            if (sqlite3_step(stmt) == SQLITE_ROW) {
                *total_alerts = sqlite3_column_int(stmt, 0);
            }
            sqlite3_finalize(stmt);
        }
    }

    if (today_alerts) {
        *today_alerts = 0;
        time_t now = time(NULL);
        struct tm *tm_info = localtime(&now);
        tm_info->tm_hour = 0;
        tm_info->tm_min = 0;
        tm_info->tm_sec = 0;
        time_t today_start = mktime(tm_info);

        char sql[256];
        snprintf(sql, sizeof(sql), "SELECT COUNT(*) FROM alerts WHERE timestamp >= %ld;", (long)today_start);
        if (sqlite3_prepare_v2(config->db, sql, -1, &stmt, NULL) == SQLITE_OK) {
            if (sqlite3_step(stmt) == SQLITE_ROW) {
                *today_alerts = sqlite3_column_int(stmt, 0);
            }
            sqlite3_finalize(stmt);
        }
    }

    if (blocked_count) {
        *blocked_count = 0;
        const char *sql = "SELECT COUNT(*) FROM alerts WHERE blocked = 1;";
        if (sqlite3_prepare_v2(config->db, sql, -1, &stmt, NULL) == SQLITE_OK) {
            if (sqlite3_step(stmt) == SQLITE_ROW) {
                *blocked_count = sqlite3_column_int(stmt, 0);
            }
            sqlite3_finalize(stmt);
        }
    }

    return 0;
}

void db_close(sqlids_config_t *config) {
    if (config->db) {
        sqlite3_close(config->db);
        config->db = NULL;
    }
}
