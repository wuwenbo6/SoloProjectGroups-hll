#include "sqlids.h"
#include <ctype.h>

typedef struct {
    const char *pattern;
    const char *description;
} sqli_rule_t;

static sqli_rule_t default_patterns[] = {
    {"('|%27).*(or|OR|and|AND).*(=|%3D)", "Classic SQLi with OR/AND"},
    {"(union|UNION).*(select|SELECT)", "UNION SELECT SQLi"},
    {"(select|SELECT).*(from|FROM)", "SELECT FROM SQLi"},
    {"(insert|INSERT).*(into|INTO)", "INSERT INTO SQLi"},
    {"(delete|DELETE).*(from|FROM)", "DELETE FROM SQLi"},
    {"(drop|DROP).*(table|TABLE)", "DROP TABLE SQLi"},
    {"(update|UPDATE).*(set|SET)", "UPDATE SET SQLi"},
    {"--.*$|;--", "SQL comment injection"},
    {";.*(select|insert|delete|drop|update|exec|execute)", "Multi-query SQLi"},
    {"(exec|EXEC|execute|EXECUTE).*(sp_|xp_)", "Stored procedure SQLi"},
    {"(xp_cmdshell|sp_oa)", "Command execution SQLi"},
    {"(benchmark|sleep|waitfor|pg_sleep)", "Time-based blind SQLi"},
    {"(char|ascii|substring|substr|len|length).*\\(", "Function-based blind SQLi"},
    {"(information_schema|sysobjects|syscolumns)", "Schema enumeration"},
    {"(load_file|into[.]outfile|into[.]dumpfile)", "File manipulation SQLi"},
};

int init_sqli_detection(sqlids_config_t *config) {
    int num_patterns = sizeof(default_patterns) / sizeof(default_patterns[0]);

    for (int i = 0; i < num_patterns && config->pattern_count < MAX_PATTERNS; i++) {
        sqli_pattern_t *p = &config->patterns[config->pattern_count];

        p->pattern = strdup(default_patterns[i].pattern);
        p->description = default_patterns[i].description;

        int rc = regcomp(&p->regex, p->pattern, REG_EXTENDED | REG_ICASE | REG_NEWLINE);
        if (rc != 0) {
            char errbuf[256];
            regerror(rc, &p->regex, errbuf, sizeof(errbuf));
            fprintf(stderr, "Regex compilation error for '%s': %s\n", p->pattern, errbuf);
            free(p->pattern);
            continue;
        }

        config->pattern_count++;
    }

    return config->pattern_count > 0 ? 0 : -1;
}

void free_patterns(sqlids_config_t *config) {
    for (int i = 0; i < config->pattern_count; i++) {
        regfree(&config->patterns[i].regex);
        if (config->patterns[i].pattern) {
            free(config->patterns[i].pattern);
            config->patterns[i].pattern = NULL;
        }
    }
    config->pattern_count = 0;
}

int detect_sqli(sqlids_config_t *config, const char *data) {
    if (!data || strlen(data) < 3) {
        return 0;
    }

    regmatch_t pmatch[10];

    for (int i = 0; i < config->pattern_count; i++) {
        sqli_pattern_t *p = &config->patterns[i];

        int rc = regexec(&p->regex, data, 10, pmatch, 0);
        if (rc == 0) {
            if (config->verbose && pmatch[0].rm_so != -1) {
                char match[256];
                int match_len = pmatch[0].rm_eo - pmatch[0].rm_so;
                if (match_len > 255) match_len = 255;
                strncpy(match, data + pmatch[0].rm_so, match_len);
                match[match_len] = '\0';
                log_message(config, "DEBUG", "Matched pattern: %s (%s)", p->description, match);
            }
            return 1;
        }
    }

    return 0;
}
