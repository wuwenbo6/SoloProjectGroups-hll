package analyzer

import (
	"fmt"
	"regexp"
	"strings"
)

type IndexSuggestion struct {
	Table       string
	Columns     []string
	Reason      string
	Confidence  int
}

type QueryAnalysis struct {
	QueryType       string
	Tables          []string
	Columns         []string
	WhereColumns    []string
	JoinColumns     []string
	OrderByColumns  []string
	GroupByColumns  []string
	HasWildcard     bool
	HasFullScan     bool
	IsComplex       bool
	Suggestions     []IndexSuggestion
	Warnings        []string
}

type Analyzer struct {
	selectRegex   *regexp.Regexp
	fromRegex     *regexp.Regexp
	whereRegex    *regexp.Regexp
	joinRegex     *regexp.Regexp
	orderByRegex  *regexp.Regexp
	groupByRegex  *regexp.Regexp
	havingRegex   *regexp.Regexp
	limitRegex    *regexp.Regexp
}

func NewAnalyzer() *Analyzer {
	return &Analyzer{
		selectRegex:  regexp.MustCompile(`(?i)SELECT\s+(.+?)\s+FROM`),
		fromRegex:    regexp.MustCompile(`(?i)FROM\s+([^\s,;]+(?:\s*,\s*[^\s,;]+)*)`),
		whereRegex:   regexp.MustCompile(`(?i)WHERE\s+(.+?)(?:\s+(?:ORDER|GROUP|HAVING|LIMIT|UNION|JOIN|$))`),
		joinRegex:    regexp.MustCompile(`(?i)(?:JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN)\s+([^\s]+)\s+ON\s+([^ ]+)\s*=\s*([^ ]+)`),
		orderByRegex: regexp.MustCompile(`(?i)ORDER BY\s+(.+?)(?:\s+(?:LIMIT|$))`),
		groupByRegex: regexp.MustCompile(`(?i)GROUP BY\s+(.+?)(?:\s+(?:ORDER|HAVING|LIMIT|$))`),
		havingRegex:  regexp.MustCompile(`(?i)HAVING\s+(.+?)(?:\s+(?:ORDER|LIMIT|$))`),
		limitRegex:   regexp.MustCompile(`(?i)LIMIT\s+(\d+)`),
	}
}

func (a *Analyzer) Analyze(sql string) *QueryAnalysis {
	sql = strings.TrimSpace(sql)
	analysis := &QueryAnalysis{
		Suggestions: make([]IndexSuggestion, 0),
		Warnings:    make([]string, 0),
	}

	sqlUpper := strings.ToUpper(sql)

	switch {
	case strings.HasPrefix(sqlUpper, "SELECT"):
		analysis.QueryType = "SELECT"
	case strings.HasPrefix(sqlUpper, "INSERT"):
		analysis.QueryType = "INSERT"
		return analysis
	case strings.HasPrefix(sqlUpper, "UPDATE"):
		analysis.QueryType = "UPDATE"
	case strings.HasPrefix(sqlUpper, "DELETE"):
		analysis.QueryType = "DELETE"
	case strings.HasPrefix(sqlUpper, "CREATE"):
		analysis.QueryType = "CREATE"
		return analysis
	case strings.HasPrefix(sqlUpper, "ALTER"):
		analysis.QueryType = "ALTER"
		return analysis
	default:
		analysis.QueryType = "OTHER"
		return analysis
	}

	analysis.Tables = a.extractTables(sql)
	analysis.Columns = a.extractColumns(sql)
	analysis.WhereColumns = a.extractWhereColumns(sql)
	analysis.JoinColumns = a.extractJoinColumns(sql)
	analysis.OrderByColumns = a.extractOrderBy(sql)
	analysis.GroupByColumns = a.extractGroupBy(sql)

	if strings.Contains(sql, "SELECT *") || strings.Contains(sql, "select *") {
		analysis.HasWildcard = true
		analysis.Warnings = append(analysis.Warnings, "使用了 SELECT *，建议明确指定需要的列")
	}

	if len(analysis.WhereColumns) == 0 && analysis.QueryType == "SELECT" {
		if !strings.Contains(sqlUpper, "LIMIT") {
			analysis.HasFullScan = true
			analysis.Warnings = append(analysis.Warnings, "查询没有 WHERE 条件，可能导致全表扫描")
		}
	}

	analysis.IsComplex = len(analysis.Tables) > 2 || len(analysis.JoinColumns) > 2 || 
		len(analysis.GroupByColumns) > 0 || len(analysis.OrderByColumns) > 2

	analysis.Suggestions = a.generateSuggestions(analysis)

	return analysis
}

func (a *Analyzer) extractTables(sql string) []string {
	tables := make([]string, 0)
	seen := make(map[string]bool)

	matches := a.fromRegex.FindStringSubmatch(sql)
	if len(matches) > 1 {
		tableStr := matches[1]
		for _, t := range strings.Split(tableStr, ",") {
			t = strings.TrimSpace(t)
			t = strings.Split(t, " ")[0]
			t = strings.Trim(t, "`\"'")
			if t != "" && !seen[t] {
				tables = append(tables, t)
				seen[t] = true
			}
		}
	}

	joinMatches := a.joinRegex.FindAllStringSubmatch(sql, -1)
	for _, m := range joinMatches {
		if len(m) > 1 {
			t := strings.Trim(m[1], "`\"'")
			if !seen[t] {
				tables = append(tables, t)
				seen[t] = true
			}
		}
	}

	return tables
}

func (a *Analyzer) extractColumns(sql string) []string {
	columns := make([]string, 0)
	matches := a.selectRegex.FindStringSubmatch(sql)
	if len(matches) > 1 {
		colStr := matches[1]
		if colStr != "*" {
			for _, c := range strings.Split(colStr, ",") {
				c = strings.TrimSpace(c)
				c = strings.Split(c, " ")[0]
				c = strings.Trim(c, "`\"'")
				if c != "" {
					columns = append(columns, c)
				}
			}
		}
	}
	return columns
}

func (a *Analyzer) extractWhereColumns(sql string) []string {
	columns := make([]string, 0)
	seen := make(map[string]bool)

	matches := a.whereRegex.FindStringSubmatch(sql)
	if len(matches) > 1 {
		whereClause := matches[1]
		columnRegex := regexp.MustCompile(`([a-zA-Z_][a-zA-Z0-9_.]*)\s*(?:=|>|<|>=|<=|!=|LIKE|IN)`)
		colMatches := columnRegex.FindAllStringSubmatch(whereClause, -1)
		for _, m := range colMatches {
			if len(m) > 1 {
				col := m[1]
				if !strings.HasPrefix(col, "'") && !strings.HasPrefix(col, "\"") {
					if !seen[col] {
						columns = append(columns, col)
						seen[col] = true
					}
				}
			}
		}
	}

	return columns
}

func (a *Analyzer) extractJoinColumns(sql string) []string {
	columns := make([]string, 0)
	seen := make(map[string]bool)

	matches := a.joinRegex.FindAllStringSubmatch(sql, -1)
	for _, m := range matches {
		if len(m) > 3 {
			col1 := strings.Trim(m[2], "`\"'")
			col2 := strings.Trim(m[3], "`\"'")
			if !seen[col1] {
				columns = append(columns, col1)
				seen[col1] = true
			}
			if !seen[col2] {
				columns = append(columns, col2)
				seen[col2] = true
			}
		}
	}

	return columns
}

func (a *Analyzer) extractOrderBy(sql string) []string {
	columns := make([]string, 0)
	matches := a.orderByRegex.FindStringSubmatch(sql)
	if len(matches) > 1 {
		orderStr := matches[1]
		for _, c := range strings.Split(orderStr, ",") {
			c = strings.TrimSpace(c)
			c = strings.Split(c, " ")[0]
			c = strings.Trim(c, "`\"'")
			if c != "" {
				columns = append(columns, c)
			}
		}
	}
	return columns
}

func (a *Analyzer) extractGroupBy(sql string) []string {
	columns := make([]string, 0)
	matches := a.groupByRegex.FindStringSubmatch(sql)
	if len(matches) > 1 {
		groupStr := matches[1]
		for _, c := range strings.Split(groupStr, ",") {
			c = strings.TrimSpace(c)
			c = strings.Trim(c, "`\"'")
			if c != "" {
				columns = append(columns, c)
			}
		}
	}
	return columns
}

func (a *Analyzer) generateSuggestions(analysis *QueryAnalysis) []IndexSuggestion {
	suggestions := make([]IndexSuggestion, 0)

	if len(analysis.Tables) == 0 {
		return suggestions
	}

	mainTable := analysis.Tables[0]

	allColumns := make([]string, 0)
	allColumns = append(allColumns, analysis.WhereColumns...)
	allColumns = append(allColumns, analysis.JoinColumns...)
	
	if len(allColumns) > 0 {
		suggestions = append(suggestions, IndexSuggestion{
			Table:      mainTable,
			Columns:    allColumns,
			Reason:     fmt.Sprintf("WHERE/JOIN 条件涉及 %d 列，建议创建复合索引", len(allColumns)),
			Confidence: 90,
		})
	}

	if len(analysis.OrderByColumns) > 0 && len(analysis.WhereColumns) > 0 {
		combined := make([]string, 0)
		combined = append(combined, analysis.WhereColumns...)
		for _, col := range analysis.OrderByColumns {
			found := false
			for _, wc := range analysis.WhereColumns {
				if col == wc {
					found = true
					break
				}
			}
			if !found {
				combined = append(combined, col)
			}
		}
		if len(combined) > len(analysis.WhereColumns) {
			suggestions = append(suggestions, IndexSuggestion{
				Table:      mainTable,
				Columns:    combined,
				Reason:     "WHERE + ORDER BY 组合查询，建议创建覆盖索引避免文件排序",
				Confidence: 85,
			})
		}
	}

	if len(analysis.GroupByColumns) > 0 {
		suggestions = append(suggestions, IndexSuggestion{
			Table:      mainTable,
			Columns:    analysis.GroupByColumns,
			Reason:     "GROUP BY 列，索引可以加速分组操作",
			Confidence: 80,
		})
	}

	if analysis.IsComplex && len(analysis.Tables) > 1 {
		for _, table := range analysis.Tables {
			if len(table) > 0 {
				suggestions = append(suggestions, IndexSuggestion{
					Table:      table,
					Columns:    []string{"<join_column>"},
					Reason:     fmt.Sprintf("多表关联查询 (%d 表)，建议检查表关联列是否有索引", len(analysis.Tables)),
					Confidence: 70,
				})
			}
		}
	}

	return suggestions
}

func (a *QueryAnalysis) FormatSuggestions() string {
	if len(a.Suggestions) == 0 {
		return "  🔍 暂无索引建议"
	}

	result := ""
	for i, s := range a.Suggestions {
		confidence := ""
		switch {
		case s.Confidence >= 80:
			confidence = "高"
		case s.Confidence >= 60:
			confidence = "中"
		default:
			confidence = "低"
		}
		
		columns := strings.Join(s.Columns, ", ")
		result += fmt.Sprintf("  💡 建议 #%d (置信度: %s)\n", i+1, confidence)
		result += fmt.Sprintf("     表: %s\n", s.Table)
		result += fmt.Sprintf("     列: %s\n", columns)
		result += fmt.Sprintf("     原因: %s\n", s.Reason)
	}

	if len(a.Warnings) > 0 {
		result += "  ⚠️  警告:\n"
		for _, w := range a.Warnings {
			result += fmt.Sprintf("     - %s\n", w)
		}
	}

	return result
}

func (a *QueryAnalysis) IsSlowQueryCandidate() bool {
	return a.HasFullScan || a.IsComplex || len(a.Tables) > 2 || a.HasWildcard
}
