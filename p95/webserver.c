#include "sqlids.h"
#include <pthread.h>
#include <sys/socket.h>
#include <netinet/in.h>

static const char *html_template =
"<!DOCTYPE html>\n"
"<html lang=\"zh-CN\">\n"
"<head>\n"
"  <meta charset=\"UTF-8\">\n"
"  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
"  <title>SQLIDS - Web管理界面</title>\n"
"  <style>\n"
"    * { margin: 0; padding: 0; box-sizing: border-box; }\n"
"    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; }\n"
"    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1rem 2rem; }\n"
"    .header h1 { font-size: 1.5rem; }\n"
"    .container { max-width: 1400px; margin: 0 auto; padding: 2rem; }\n"
"    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }\n"
"    .stat-card { background: white; border-radius: 8px; padding: 1.5rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }\n"
"    .stat-card h3 { font-size: 0.875rem; color: #666; margin-bottom: 0.5rem; }\n"
"    .stat-card .value { font-size: 2rem; font-weight: bold; color: #333; }\n"
"    .stat-card.total .value { color: #667eea; }\n"
"    .stat-card.today .value { color: #f093fb; }\n"
"    .stat-card.blocked .value { color: #f5576c; }\n"
"    .section { background: white; border-radius: 8px; padding: 1.5rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 2rem; }\n"
"    .section h2 { font-size: 1.25rem; margin-bottom: 1rem; color: #333; }\n"
"    .alert-table { width: 100%; border-collapse: collapse; }\n"
"    .alert-table th, .alert-table td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #eee; }\n"
"    .alert-table th { background: #f8f9fa; font-weight: 600; color: #555; }\n"
"    .alert-table tr:hover { background: #f8f9fa; }\n"
"    .badge { padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }\n"
"    .badge.blocked { background: #fef2f2; color: #dc2626; }\n"
"    .badge.detected { background: #fef3c7; color: #d97706; }\n"
"    .score-bar { height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; }\n"
"    .score-fill { height: 100%; background: linear-gradient(90deg, #22c55e, #eab308, #ef4444); }\n"
"    .nav { display: flex; gap: 1rem; margin-bottom: 1rem; }\n"
"    .btn { padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; font-size: 0.875rem; }\n"
"    .btn-primary { background: #667eea; color: white; }\n"
"    .btn-secondary { background: #e5e7eb; color: #374151; }\n"
"    .btn:hover { opacity: 0.9; }\n"
"    .uri-cell { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace; font-size: 0.8rem; }\n"
"    .status-running { color: #22c55e; }\n"
"    .config-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }\n"
"    .config-item { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #eee; }\n"
"    .config-label { color: #666; }\n"
"    .config-value { font-weight: 600; color: #333; }\n"
"  </style>\n"
"</head>\n"
"<body>\n"
"  <div class=\"header\">\n"
"    <h1>🛡️ SQLIDS - SQL注入检测系统</h1>\n"
"  </div>\n"
"  <div class=\"container\">\n"
"    <div class=\"stats\">\n"
"      <div class=\"stat-card total\">\n"
"        <h3>总报警数</h3>\n"
"        <div class=\"value\" id=\"totalAlerts\">0</div>\n"
"      </div>\n"
"      <div class=\"stat-card today\">\n"
"        <h3>今日报警</h3>\n"
"        <div class=\"value\" id=\"todayAlerts\">0</div>\n"
"      </div>\n"
"      <div class=\"stat-card blocked\">\n"
"        <h3>已阻断</h3>\n"
"        <div class=\"value\" id=\"blockedCount\">0</div>\n"
"      </div>\n"
"      <div class=\"stat-card\">\n"
"        <h3>运行状态</h3>\n"
"        <div class=\"value status-running\">● 运行中</div>\n"
"      </div>\n"
"    </div>\n"
"\n"
"    <div class=\"section\">\n"
"      <h2>快速操作</h2>\n"
"      <div class=\"nav\">\n"
"        <button class=\"btn btn-primary\" onclick=\"exportCSV()\">导出 CSV</button>\n"
"        <button class=\"btn btn-primary\" onclick=\"exportJSON()\">导出 JSON</button>\n"
"        <button class=\"btn btn-secondary\" onclick=\"location.reload()\">刷新数据</button>\n"
"      </div>\n"
"    </div>\n"
"\n"
"    <div class=\"section\">\n"
"      <h2>系统配置</h2>\n"
"      <div class=\"config-grid\">\n"
"        <div class=\"config-item\">\n"
"          <span class=\"config-label\">监听接口</span>\n"
"          <span class=\"config-value\" id=\"configInterface\">-</span>\n"
"        </div>\n"
"        <div class=\"config-item\">\n"
"          <span class=\"config-label\">监控端口</span>\n"
"          <span class=\"config-value\" id=\"configPort\">-</span>\n"
"        </div>\n"
"        <div class=\"config-item\">\n"
"          <span class=\"config-label\">阻断模式</span>\n"
"          <span class=\"config-value\" id=\"configBlock\">-</span>\n"
"        </div>\n"
"        <div class=\"config-item\">\n"
"          <span class=\"config-label\">机器学习检测</span>\n"
"          <span class=\"config-value\" id=\"configML\">-</span>\n"
"        </div>\n"
"      </div>\n"
"    </div>\n"
"\n"
"    <div class=\"section\">\n"
"      <h2>最近报警记录</h2>\n"
"      <table class=\"alert-table\">\n"
"        <thead>\n"
"          <tr>\n"
"            <th>时间</th>\n"
"            <th>源IP</th>\n"
"            <th>目的IP</th>\n"
"            <th>方法</th>\n"
"            <th>URI</th>\n"
"            <th>异常分</th>\n"
"            <th>状态</th>\n"
"          </tr>\n"
"        </thead>\n"
"        <tbody id=\"alertTableBody\">\n"
"          <tr><td colspan=\"7\" style=\"text-align:center;color:#999;\">加载中...</td></tr>\n"
"        </tbody>\n"
"      </table>\n"
"    </div>\n"
"  </div>\n"
"\n"
"  <script>\n"
"    async function loadData() {\n"
"      try {\n"
"        const statsRes = await fetch('/api/stats');\n"
"        const stats = await statsRes.json();\n"
"        document.getElementById('totalAlerts').textContent = stats.total;\n"
"        document.getElementById('todayAlerts').textContent = stats.today;\n"
"        document.getElementById('blockedCount').textContent = stats.blocked;\n"
"        \n"
"        const configRes = await fetch('/api/config');\n"
"        const config = await configRes.json();\n"
"        document.getElementById('configInterface').textContent = config.interface;\n"
"        document.getElementById('configPort').textContent = config.port;\n"
"        document.getElementById('configBlock').textContent = config.block_mode ? '启用' : '禁用';\n"
"        document.getElementById('configML').textContent = config.ml_enabled ? '启用' : '禁用';\n"
"        \n"
"        const alertsRes = await fetch('/api/alerts?limit=50');\n"
"        const alerts = await alertsRes.json();\n"
"        renderAlerts(alerts);\n"
"      } catch (e) {\n"
"        console.error('Load failed:', e);\n"
"      }\n"
"    }\n"
"    \n"
"    function renderAlerts(alerts) {\n"
"      const tbody = document.getElementById('alertTableBody');\n"
"      if (alerts.length === 0) {\n"
"        tbody.innerHTML = '<tr><td colspan=\"7\" style=\"text-align:center;color:#999;\">暂无报警记录</td></tr>';\n"
"        return;\n"
"      }\n"
"      tbody.innerHTML = alerts.map(a => {\n"
"        const date = new Date(a.timestamp * 1000);\n"
"        const timeStr = date.toLocaleString('zh-CN');\n"
"        const scorePct = Math.min(a.total_score * 100, 100);\n"
"        return `\n"
"          <tr>\n"
"            <td>${timeStr}</td>\n"
"            <td>${a.src_ip}</td>\n"
"            <td>${a.dst_ip}</td>\n"
"            <td>${a.method}</td>\n"
"            <td class=\"uri-cell\" title=\"${a.uri}\">${a.uri}</td>\n"
"            <td><div class=\"score-bar\"><div class=\"score-fill\" style=\"width:${scorePct}%\"></div></div>${a.total_score.toFixed(2)}</td>\n"
"            <td><span class=\"badge ${a.blocked ? 'blocked' : 'detected'}\">${a.blocked ? '已阻断' : '已检测'}</span></td>\n"
"          </tr>\n"
"        `;\n"
"      }).join('');\n"
"    }\n"
"    \n"
"    function exportCSV() {\n"
"      window.location.href = '/api/export/csv';\n"
"    }\n"
"    \n"
"    function exportJSON() {\n"
"      window.location.href = '/api/export/json';\n"
"    }\n"
"    \n"
"    loadData();\n"
"    setInterval(loadData, 5000);\n"
"  </script>\n"
"</body>\n"
"</html>\n";

static void send_response(int client_fd, const char *status, const char *content_type, const char *body, int body_len) {
    char header[1024];
    snprintf(header, sizeof(header),
             "HTTP/1.1 %s\r\n"
             "Content-Type: %s\r\n"
             "Content-Length: %d\r\n"
             "Connection: close\r\n"
             "Access-Control-Allow-Origin: *\r\n"
             "\r\n",
             status, content_type, body_len);

    send(client_fd, header, strlen(header), 0);
    send(client_fd, body, body_len, 0);
}

static char *get_query_param(const char *url, const char *name) {
    char *p = strstr(url, name);
    if (!p) return NULL;
    p += strlen(name) + 1;
    char *end = strchr(p, '&');
    if (!end) end = strchr(p, ' ');
    if (!end) end = p + strlen(p);
    int len = end - p;
    char *val = malloc(len + 1);
    strncpy(val, p, len);
    val[len] = '\0';
    return val;
}

static void handle_api(sqlids_config_t *config, int client_fd, const char *url) {
    char response[8192];

    if (strncmp(url, "/api/stats", 10) == 0) {
        int total = 0, today = 0, blocked = 0;
        db_get_stats(config, &total, &today, &blocked);
        snprintf(response, sizeof(response),
                 "{\"total\":%d,\"today\":%d,\"blocked\":%d}",
                 total, today, blocked);
        send_response(client_fd, "200 OK", "application/json", response, strlen(response));
    }
    else if (strncmp(url, "/api/config", 11) == 0) {
        snprintf(response, sizeof(response),
                 "{\"interface\":\"%s\",\"port\":%d,\"block_mode\":%s,\"ml_enabled\":%s,"
                 "\"anomaly_threshold\":%.2f,\"web_port\":%d}",
                 config->interface, config->port,
                 config->block_mode ? "true" : "false",
                 config->ml_enabled ? "true" : "false",
                 config->anomaly_threshold, config->web_port);
        send_response(client_fd, "200 OK", "application/json", response, strlen(response));
    }
    else if (strncmp(url, "/api/alerts", 11) == 0) {
        char *limit_str = get_query_param(url, "limit");
        int limit = limit_str ? atoi(limit_str) : 50;
        free(limit_str);

        alert_record_t *alerts = NULL;
        int count = 0;
        db_query_alerts(config, NULL, limit, &alerts, &count);

        char *json = malloc(65536);
        char *p = json;
        p += sprintf(p, "{\"total\":%d,\"alerts\":[", count);

        for (int i = 0; i < count; i++) {
            alert_record_t *a = &alerts[i];
            if (i > 0) *p++ = ',';
            p += sprintf(p,
                "{\"id\":%lld,\"timestamp\":%ld,\"src_ip\":\"%s\",\"dst_ip\":\"%s\","
                "\"src_port\":%d,\"dst_port\":%d,\"method\":\"%s\","
                "\"uri\":\"%s\",\"anomaly_score\":%.4f,\"regex_score\":%.4f,"
                "\"total_score\":%.4f,\"blocked\":%s}",
                (long long)a->id, (long)a->timestamp, a->src_ip, a->dst_ip,
                a->src_port, a->dst_port, a->method,
                a->uri, a->anomaly_score, a->regex_score,
                a->total_score, a->blocked ? "true" : "false");
        }

        p += sprintf(p, "]}");
        send_response(client_fd, "200 OK", "application/json", json, p - json);
        free(json);
        free(alerts);
    }
    else if (strncmp(url, "/api/export/csv", 15) == 0) {
        char filename[] = "/tmp/sqlids_export_XXXXXX.csv";
        int fd = mkstemps(filename, 4);
        if (fd >= 0) {
            close(fd);
            export_alerts_csv(config, filename, NULL);
            FILE *fp = fopen(filename, "rb");
            if (fp) {
                fseek(fp, 0, SEEK_END);
                long fsize = ftell(fp);
                fseek(fp, 0, SEEK_SET);
                char *csv_data = malloc(fsize + 1);
                fread(csv_data, 1, fsize, fp);
                fclose(fp);

                char header[1024];
                snprintf(header, sizeof(header),
                         "HTTP/1.1 200 OK\r\n"
                         "Content-Type: text/csv\r\n"
                         "Content-Disposition: attachment; filename=\"alerts.csv\"\r\n"
                         "Content-Length: %ld\r\n"
                         "Connection: close\r\n"
                         "\r\n", fsize);
                send(client_fd, header, strlen(header), 0);
                send(client_fd, csv_data, fsize, 0);
                free(csv_data);
                unlink(filename);
            }
        }
    }
    else if (strncmp(url, "/api/export/json", 16) == 0) {
        char filename[] = "/tmp/sqlids_export_XXXXXX.json";
        int fd = mkstemps(filename, 5);
        if (fd >= 0) {
            close(fd);
            export_alerts_json(config, filename, NULL);
            FILE *fp = fopen(filename, "rb");
            if (fp) {
                fseek(fp, 0, SEEK_END);
                long fsize = ftell(fp);
                fseek(fp, 0, SEEK_SET);
                char *json_data = malloc(fsize + 1);
                fread(json_data, 1, fsize, fp);
                fclose(fp);

                char header[1024];
                snprintf(header, sizeof(header),
                         "HTTP/1.1 200 OK\r\n"
                         "Content-Type: application/json\r\n"
                         "Content-Disposition: attachment; filename=\"alerts.json\"\r\n"
                         "Content-Length: %ld\r\n"
                         "Connection: close\r\n"
                         "\r\n", fsize);
                send(client_fd, header, strlen(header), 0);
                send(client_fd, json_data, fsize, 0);
                free(json_data);
                unlink(filename);
            }
        }
    }
    else {
        send_response(client_fd, "404 Not Found", "application/json", "{\"error\":\"Not Found\"}", 20);
    }
}

typedef struct {
    int client_fd;
    sqlids_config_t *config;
} client_arg_t;

static void *handle_client(void *arg) {
    client_arg_t *client_arg = (client_arg_t *)arg;
    int client_fd = client_arg->client_fd;
    sqlids_config_t *config = client_arg->config;
    free(client_arg);

    char buffer[4096];
    int n = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
    if (n <= 0) {
        close(client_fd);
        return NULL;
    }
    buffer[n] = '\0';

    char method[16], url[1024];
    sscanf(buffer, "%s %s", method, url);

    if (strncmp(url, "/api/", 5) == 0) {
        handle_api(config, client_fd, url);
    } else {
        send_response(client_fd, "200 OK", "text/html; charset=utf-8", html_template, strlen(html_template));
    }

    close(client_fd);
    return NULL;
}

void *web_server_thread(void *arg) {
    sqlids_config_t *config = (sqlids_config_t *)arg;

    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) {
        perror("socket");
        return NULL;
    }

    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(config->web_port);

    if (bind(server_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("bind");
        close(server_fd);
        return NULL;
    }

    if (listen(server_fd, 10) < 0) {
        perror("listen");
        close(server_fd);
        return NULL;
    }

    log_message(config, "INFO", "Web management interface started on port %d", config->web_port);

    while (config->running) {
        struct sockaddr_in client_addr;
        socklen_t client_len = sizeof(client_addr);
        client_arg_t *client_arg = malloc(sizeof(client_arg_t));
        client_arg->client_fd = accept(server_fd, (struct sockaddr *)&client_addr, &client_len);
        client_arg->config = config;

        if (client_arg->client_fd < 0) {
            free(client_arg);
            continue;
        }

        pthread_t client_thread;
        pthread_create(&client_thread, NULL, handle_client, client_arg);
        pthread_detach(client_thread);
    }

    close(server_fd);
    return NULL;
}

int web_server_start(sqlids_config_t *config) {
    if (!config->web_enabled) return 0;

    config->running = 1;
    pthread_create(&config->web_thread, NULL, web_server_thread, config);
    return 0;
}

void web_server_stop(sqlids_config_t *config) {
    if (config->web_enabled && config->running) {
        config->running = 0;
        pthread_cancel(config->web_thread);
        pthread_join(config->web_thread, NULL);
    }
}
