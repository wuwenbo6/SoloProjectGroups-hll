#include "sqlids.h"
#include <math.h>
#include <ctype.h>

static const char *normal_chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_./?=&%";
static const char *sqli_keywords[] = {
    "union", "select", "insert", "delete", "update", "drop", "alter", "create",
    "exec", "execute", "sp_", "xp_", "cmdshell", "information_schema", "sysobjects",
    "or 1=1", "and 1=1", "--", "/*", "*/", "waitfor", "delay", "benchmark",
    "sleep", "load_file", "into outfile", "into dumpfile"
};

int ml_init(ml_model_t *model) {
    memset(model, 0, sizeof(ml_model_t));
    model->trained = 0;
    model->sample_count = 0;
    return 0;
}

void ml_train(ml_model_t *model, const char *data) {
    if (!data) return;

    int len = strlen(data);
    if (len == 0) return;

    for (int i = 0; i < len; i++) {
        unsigned char c = (unsigned char)data[i];
        model->char_freq[c] += 1.0;
    }

    for (int i = 0; i < len - 1; i++) {
        unsigned char c1 = (unsigned char)data[i];
        unsigned char c2 = (unsigned char)data[i+1];
        model->bigram_freq[c1][c2] += 1.0;
    }

    for (int i = 0; i < len - 2; i++) {
        unsigned char c1 = (unsigned char)data[i];
        unsigned char c2 = (unsigned char)data[i+1];
        unsigned char c3 = (unsigned char)data[i+2];
        model->trigram_freq[c1][c2][c3] += 1.0;
    }

    model->sample_count++;
    model->trained = 1;
}

static double calculate_special_char_ratio(const char *data) {
    if (!data || !*data) return 0.0;

    int total = 0, special = 0;
    for (const char *p = data; *p; p++) {
        total++;
        if (!isalnum((unsigned char)*p) && *p != '/' && *p != '.' && *p != '-' && *p != '_') {
            special++;
        }
    }
    return (double)special / total;
}

static int count_sqli_keywords(const char *data, char *details, int details_len) {
    if (!data) return 0;

    int count = 0;
    char lower[4096];
    strncpy(lower, data, sizeof(lower) - 1);
    lower[sizeof(lower) - 1] = '\0';

    for (int i = 0; lower[i]; i++) {
        lower[i] = tolower((unsigned char)lower[i]);
    }

    details[0] = '\0';
    for (size_t i = 0; i < sizeof(sqli_keywords) / sizeof(sqli_keywords[0]); i++) {
        if (strstr(lower, sqli_keywords[i])) {
            count++;
            if (strlen(details) + strlen(sqli_keywords[i]) + 2 < (size_t)details_len) {
                if (details[0]) strcat(details, ",");
                strcat(details, sqli_keywords[i]);
            }
        }
    }
    return count;
}

static double calculate_entropy(const char *data) {
    if (!data || !*data) return 0.0;

    int freq[256] = {0};
    int len = 0;

    for (const char *p = data; *p; p++, len++) {
        freq[(unsigned char)*p]++;
    }

    double entropy = 0.0;
    for (int i = 0; i < 256; i++) {
        if (freq[i] > 0) {
            double p = (double)freq[i] / len;
            entropy -= p * log2(p);
        }
    }
    return entropy;
}

static int count_quote_patterns(const char *data) {
    int count = 0;
    int len = strlen(data);

    for (int i = 0; i < len - 3; i++) {
        if ((data[i] == '\'' || data[i] == '"') &&
            tolower((unsigned char)data[i+1]) == 'o' &&
            tolower((unsigned char)data[i+2]) == 'r') {
            count++;
        }
        if ((data[i] == '\'' || data[i] == '"') &&
            tolower((unsigned char)data[i+1]) == 'a' &&
            tolower((unsigned char)data[i+2]) == 'n' &&
            tolower((unsigned char)data[i+3]) == 'd') {
            count++;
        }
    }

    int single_quotes = 0, double_quotes = 0;
    for (int i = 0; i < len; i++) {
        if (data[i] == '\'') single_quotes++;
        if (data[i] == '"') double_quotes++;
    }

    if (single_quotes % 2 != 0) count++;
    if (double_quotes % 2 != 0) count++;

    return count;
}

double ml_calculate_anomaly_score(ml_model_t *model, const char *data, detection_result_t *result) {
    if (!data || !result) return 0.0;

    memset(result, 0, sizeof(detection_result_t));

    double special_ratio = calculate_special_char_ratio(data);
    result->special_char_ratio = special_ratio;

    char keyword_details[256];
    int keyword_count = count_sqli_keywords(data, keyword_details, sizeof(keyword_details));

    double entropy = calculate_entropy(data);
    int quote_patterns = count_quote_patterns(data);

    double keyword_score = fmin((double)keyword_count * 0.15, 0.6);
    double special_score = fmin(special_ratio * 2.0, 0.5);
    double entropy_score = fmax(0, (entropy - 4.0) / 3.0);
    double quote_score = fmin((double)quote_patterns * 0.15, 0.4);

    result->char_freq_score = special_score;
    result->ngram_score = keyword_score + entropy_score * 0.3;
    result->anomaly_score = keyword_score * 0.4 + special_score * 0.3 +
                            entropy_score * 0.15 + quote_score * 0.15;

    if (strlen(keyword_details) > 0) {
        snprintf(result->details, sizeof(result->details),
                 "keywords[%s], special=%.2f, entropy=%.2f, quotes=%d",
                 keyword_details, special_ratio, entropy, quote_patterns);
    } else {
        snprintf(result->details, sizeof(result->details),
                 "special=%.2f, entropy=%.2f, quotes=%d",
                 special_ratio, entropy, quote_patterns);
    }

    return result->anomaly_score;
}

int detect_sqli_full(sqlids_config_t *config, const char *data, detection_result_t *result) {
    if (!data || !result) return 0;

    memset(result, 0, sizeof(detection_result_t));

    int regex_detected = detect_sqli(config, data);
    result->regex_score = regex_detected ? 1.0 : 0.0;

    if (config->ml_enabled) {
        ml_calculate_anomaly_score(&config->ml_model, data, result);
    }

    result->total_score = result->regex_score * 0.6 + result->anomaly_score * 0.4;

    double threshold = config->ml_enabled ? config->anomaly_threshold : 0.5;
    result->detected = (regex_detected || result->total_score >= threshold);

    return result->detected;
}

void ml_free(ml_model_t *model) {
    memset(model, 0, sizeof(ml_model_t));
}
