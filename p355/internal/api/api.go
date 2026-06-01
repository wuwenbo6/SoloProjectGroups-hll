package api

import (
	"context"
	"encoding/json"
	"fmt"
	"mqtt-attr-broker/internal/broker"
	"mqtt-attr-broker/internal/models"
	"mqtt-attr-broker/internal/router"
	"net/http"
	"strings"
	"time"
)

type API struct {
	router *router.AttributeRouter
	broker *broker.MQTTBroker
	addr   string
	server *http.Server
}

func NewAPI(r *router.AttributeRouter, b *broker.MQTTBroker, addr string) *API {
	return &API{
		router: r,
		broker: b,
		addr:   addr,
	}
}

func (a *API) Start() error {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/rules", a.handleRules)
	mux.HandleFunc("/api/rules/", a.handleRuleByID)
	mux.HandleFunc("/api/test-route", a.handleTestRoute)
	mux.HandleFunc("/api/stats", a.handleStats)
	mux.HandleFunc("/api/stats/reset", a.handleStatsReset)
	mux.HandleFunc("/api/subscriptions", a.handleSubscriptions)
	mux.HandleFunc("/api/export/stats", a.handleExportStats)

	fs := http.FileServer(http.Dir("./web"))
	mux.Handle("/", fs)

	a.server = &http.Server{
		Addr:              a.addr,
		Handler:           withCORS(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	return a.server.ListenAndServe()
}

func (a *API) Stop() {
	if a.server != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = a.server.Shutdown(ctx)
	}
}

func withCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		h.ServeHTTP(w, r)
	})
}

func (a *API) handleRules(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		a.listRules(w, r)
	case http.MethodPost:
		a.createRule(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *API) listRules(w http.ResponseWriter, r *http.Request) {
	rules := a.router.ListRules()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"rules": rules,
		"count": len(rules),
	})
}

func (a *API) createRule(w http.ResponseWriter, r *http.Request) {
	var rule models.RoutingRule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		http.Error(w, "invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := validateRule(rule); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := a.router.AddRule(rule); err != nil {
		http.Error(w, "failed to create rule: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"message": "rule created",
		"rule":    rule,
	})
}

func (a *API) handleRuleByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/rules/")
	if id == "" {
		http.Error(w, "rule id required", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		a.getRule(w, r, id)
	case http.MethodPut:
		a.updateRule(w, r, id)
	case http.MethodDelete:
		a.deleteRule(w, r, id)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *API) getRule(w http.ResponseWriter, r *http.Request, id string) {
	rule, ok := a.router.GetRule(id)
	if !ok {
		http.Error(w, "rule not found", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, rule)
}

func (a *API) updateRule(w http.ResponseWriter, r *http.Request, id string) {
	var rule models.RoutingRule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		http.Error(w, "invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := validateRule(rule); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := a.router.UpdateRule(id, rule); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "rule updated",
		"rule":    rule,
	})
}

func (a *API) deleteRule(w http.ResponseWriter, r *http.Request, id string) {
	if err := a.router.DeleteRule(id); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "rule deleted",
		"id":      id,
	})
}

func (a *API) handleTestRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var msg models.MQTTMessage
	if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
		http.Error(w, "invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	result := a.router.RouteMessage(msg)
	writeJSON(w, http.StatusOK, result)
}

func (a *API) handleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rulesWithStats := a.router.ListRulesWithStats()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"rules": rulesWithStats,
		"count": len(rulesWithStats),
	})
}

func (a *API) handleStatsReset(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		RuleID string `json:"ruleId"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	if req.RuleID != "" {
		if err := a.router.ResetStats(req.RuleID); err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
	} else {
		a.router.ResetAllStats()
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "stats reset",
	})
}

func (a *API) handleSubscriptions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	filterMgr := a.broker.GetFilterMgr()
	subs := filterMgr.GetAll()

	type subResp struct {
		ClientID     string                `json:"clientId"`
		TopicFilter  string                `json:"topicFilter"`
		Properties   models.UserProperties `json:"properties"`
		SubscribedAt int64                 `json:"subscribedAt"`
		QoS          byte                  `json:"qos"`
	}

	resp := make([]subResp, 0, len(subs))
	for _, s := range subs {
		resp = append(resp, subResp{
			ClientID:     s.ClientID,
			TopicFilter:  s.TopicFilter,
			Properties:   s.Properties,
			SubscribedAt: s.SubscribedAt,
			QoS:          s.QoS,
		})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"subscriptions": resp,
		"count":         len(resp),
	})
}

func (a *API) handleExportStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	format := r.URL.Query().Get("format")
	if format == "" {
		format = "json"
	}

	rulesWithStats := a.router.ListRulesWithStats()

	switch format {
	case "csv":
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", "attachment; filename=\"routing_stats.csv\"")
		w.WriteHeader(http.StatusOK)

		w.Write([]byte("Rule ID,Rule Name,Match Key,Match Value,Match Type,Target Topic,Enabled,Hit Count,First Hit At,Last Hit At\n"))
		for _, rws := range rulesWithStats {
			line := fmt.Sprintf("%s,%s,%s,%s,%s,%s,%t,%d,%d,%d\n",
				rws.ID, rws.Name, rws.MatchKey, rws.MatchValue, rws.MatchType,
				rws.TargetTopic, rws.Enabled, rws.Stats.HitCount,
				rws.Stats.FirstHitAt, rws.Stats.LastHitAt)
			w.Write([]byte(line))
		}

	default:
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", "attachment; filename=\"routing_stats.json\"")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"exportedAt": time.Now().Unix(),
			"rules":      rulesWithStats,
		})
	}
}

func validateRule(rule models.RoutingRule) error {
	if rule.Name == "" {
		return &validationError{"name is required"}
	}
	if rule.MatchKey == "" {
		return &validationError{"matchKey is required"}
	}
	if rule.MatchValue == "" {
		return &validationError{"matchValue is required"}
	}
	if rule.TargetTopic == "" {
		return &validationError{"targetTopic is required"}
	}

	validTypes := map[string]bool{
		"exact":    true,
		"prefix":   true,
		"suffix":   true,
		"contains": true,
		"regex":    true,
	}
	if rule.MatchType != "" && !validTypes[rule.MatchType] {
		return &validationError{"invalid matchType, must be one of: exact, prefix, suffix, contains, regex"}
	}

	return nil
}

type validationError struct {
	msg string
}

func (e *validationError) Error() string {
	return e.msg
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
