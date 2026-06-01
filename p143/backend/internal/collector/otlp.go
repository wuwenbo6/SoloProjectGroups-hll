package collector

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"trace-backend/internal/analyzer"
	"trace-backend/internal/storage"
	"trace-backend/pkg/model"
)

type OTLPTraceCollector struct {
	bufferedStorage *storage.BufferedStorage
	esStorage       *storage.ElasticsearchStorage
	analyzer        *analyzer.TraceAnalyzer
}

func NewOTLPTraceCollector(bufferedStorage *storage.BufferedStorage, esStorage *storage.ElasticsearchStorage, analyzer *analyzer.TraceAnalyzer) *OTLPTraceCollector {
	return &OTLPTraceCollector{
		bufferedStorage: bufferedStorage,
		esStorage:       esStorage,
		analyzer:        analyzer,
	}
}

type OTLPResourceSpans struct {
	Resource     OTLPResource     `json:"resource"`
	ScopeSpans   []OTLPScopeSpans `json:"scopeSpans"`
	SchemaURL    string           `json:"schemaUrl,omitempty"`
}

type OTLPResource struct {
	Attributes []OTLPAttribute `json:"attributes"`
}

type OTLPScopeSpans struct {
	Scope     OTLPInstrumentationScope `json:"scope"`
	Spans     []OTLPSpan               `json:"spans"`
	SchemaURL string                    `json:"schemaUrl,omitempty"`
}

type OTLPInstrumentationScope struct {
	Name    string `json:"name"`
	Version string `json:"version,omitempty"`
}

type OTLPSpan struct {
	TraceID        string           `json:"traceId"`
	SpanID         string           `json:"spanId"`
	TraceState     string           `json:"traceState,omitempty"`
	ParentSpanID   string           `json:"parentSpanId,omitempty"`
	Name           string           `json:"name"`
	Kind           int              `json:"kind"`
	StartTimeUnixNano string        `json:"startTimeUnixNano"`
	EndTimeUnixNano   string        `json:"endTimeUnixNano"`
	Attributes     []OTLPAttribute  `json:"attributes,omitempty"`
	Status         OTLPStatus       `json:"status,omitempty"`
	Events         []OTLPSpanEvent  `json:"events,omitempty"`
	Links          []OTLPSpanLink   `json:"links,omitempty"`
}

type OTLPAttribute struct {
	Key   string      `json:"key"`
	Value OTLPValue   `json:"value"`
}

type OTLPValue struct {
	StringValue  *string `json:"stringValue,omitempty"`
	BoolValue    *bool   `json:"boolValue,omitempty"`
	IntValue     *string `json:"intValue,omitempty"`
	DoubleValue  *float64 `json:"doubleValue,omitempty"`
}

type OTLPStatus struct {
	Message string `json:"message,omitempty"`
	Code    int    `json:"code,omitempty"`
}

type OTLPSpanEvent struct {
	TimeUnixNano string          `json:"timeUnixNano"`
	Name         string          `json:"name"`
	Attributes   []OTLPAttribute `json:"attributes,omitempty"`
}

type OTLPSpanLink struct {
	TraceID    string          `json:"traceId"`
	SpanID     string          `json:"spanId"`
	TraceState string          `json:"traceState,omitempty"`
	Attributes []OTLPAttribute `json:"attributes,omitempty"`
}

type ExportTraceServiceRequest struct {
	ResourceSpans []OTLPResourceSpans `json:"resourceSpans"`
}

func (c *OTLPTraceCollector) HandleOTLP(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var req ExportTraceServiceRequest
	if err := json.Unmarshal(body, &req); err != nil {
		log.Printf("Failed to unmarshal OTLP request: %v", err)
		http.Error(w, "invalid OTLP format", http.StatusBadRequest)
		return
	}

	spans, err := c.convertOTLPToSpans(req.ResourceSpans)
	if err != nil {
		log.Printf("Failed to convert OTLP spans: %v", err)
		http.Error(w, "failed to process spans", http.StatusInternalServerError)
		return
	}

	rejected := 0
	sampled := 0
	alertCount := 0

	if len(spans) > 0 {
		traceID := spans[0].TraceID

		traceSpans := groupSpansByTrace(spans)

		for tid, tSpans := range traceSpans {
			if c.analyzer != nil {
				if !c.analyzer.ShouldSample(tid, tSpans) {
					sampled += len(tSpans)
					continue
				}
				alerts := c.analyzer.ProcessTrace(tid, tSpans)
				alertCount += len(alerts)
			}

			if c.bufferedStorage != nil {
				queued := c.bufferedStorage.QueueSpans(tSpans)
				rejected += len(tSpans) - queued
			} else {
				ctx := r.Context()
				if err := c.esStorage.StoreSpans(ctx, tSpans); err != nil {
					log.Printf("Failed to store spans: %v", err)
				}
			}
		}
		_ = traceID
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"partialSuccess": map[string]interface{}{
			"rejectedSpans": rejected,
			"sampledSpans":  sampled,
			"alerts":        alertCount,
			"errorMessage":  "",
		},
	})
}

func groupSpansByTrace(spans []*model.Span) map[string][]*model.Span {
	result := make(map[string][]*model.Span)
	for _, span := range spans {
		result[span.TraceID] = append(result[span.TraceID], span)
	}
	return result
}

func (c *OTLPTraceCollector) convertOTLPToSpans(resourceSpans []OTLPResourceSpans) ([]*model.Span, error) {
	var allSpans []*model.Span

	for _, rs := range resourceSpans {
		fullServiceName := getFullServiceName(rs.Resource.Attributes)
		resourceAttrs := convertAttributes(rs.Resource.Attributes)

		for _, ss := range rs.ScopeSpans {
			for _, span := range ss.Spans {
				modelSpan, err := c.convertSpan(span, fullServiceName, resourceAttrs)
				if err != nil {
					log.Printf("Failed to convert span: %v", err)
					continue
				}
				allSpans = append(allSpans, modelSpan)
			}
		}
	}

	return allSpans, nil
}

func (c *OTLPTraceCollector) convertSpan(otlpSpan OTLPSpan, fullServiceName string, resourceAttrs map[string]interface{}) (*model.Span, error) {
	traceID, err := hex.DecodeString(otlpSpan.TraceID)
	if err != nil {
		return nil, fmt.Errorf("invalid trace ID: %v", err)
	}

	spanID, err := hex.DecodeString(otlpSpan.SpanID)
	if err != nil {
		return nil, fmt.Errorf("invalid span ID: %v", err)
	}

	startTime, err := parseUnixNano(otlpSpan.StartTimeUnixNano)
	if err != nil {
		return nil, fmt.Errorf("invalid start time: %v", err)
	}

	endTime, err := parseUnixNano(otlpSpan.EndTimeUnixNano)
	if err != nil {
		return nil, fmt.Errorf("invalid end time: %v", err)
	}

	attributes := convertAttributes(otlpSpan.Attributes)
	for k, v := range resourceAttrs {
		if _, exists := attributes[k]; !exists {
			attributes[k] = v
		}
	}

	parentSpanID := ""
	if otlpSpan.ParentSpanID != "" {
		parentSpanIDBytes, err := hex.DecodeString(otlpSpan.ParentSpanID)
		if err == nil {
			parentSpanID = hex.EncodeToString(parentSpanIDBytes)
		}
	}

	events := make([]model.SpanEvent, 0, len(otlpSpan.Events))
	for _, e := range otlpSpan.Events {
		eventTime, _ := parseUnixNano(e.TimeUnixNano)
		events = append(events, model.SpanEvent{
			Name:       e.Name,
			Time:       eventTime,
			Attributes: convertAttributes(e.Attributes),
		})
	}

	links := make([]model.SpanLink, 0, len(otlpSpan.Links))
	for _, l := range otlpSpan.Links {
		linkTraceID, _ := hex.DecodeString(l.TraceID)
		linkSpanID, _ := hex.DecodeString(l.SpanID)
		links = append(links, model.SpanLink{
			TraceID:    hex.EncodeToString(linkTraceID),
			SpanID:     hex.EncodeToString(linkSpanID),
			TraceState: l.TraceState,
			Attributes: convertAttributes(l.Attributes),
		})
	}

	statusCode := "STATUS_CODE_UNSET"
	switch otlpSpan.Status.Code {
	case 1:
		statusCode = "STATUS_CODE_OK"
	case 2:
		statusCode = "STATUS_CODE_ERROR"
	}

	duration := endTime.Sub(startTime).Nanoseconds() / 1000

	return &model.Span{
		TraceID:      hex.EncodeToString(traceID),
		SpanID:       hex.EncodeToString(spanID),
		ParentSpanID: parentSpanID,
		ServiceName:  fullServiceName,
		Name:         otlpSpan.Name,
		Kind:         getSpanKindName(otlpSpan.Kind),
		StartTime:    startTime,
		EndTime:      endTime,
		Duration:     duration,
		Attributes:   attributes,
		Events:       events,
		Links:        links,
		Status: model.SpanStatus{
			Code:        statusCode,
			Description: otlpSpan.Status.Message,
		},
	}, nil
}

func getFullServiceName(attributes []OTLPAttribute) string {
	serviceName := "unknown_service"
	namespace := ""

	for _, attr := range attributes {
		if attr.Key == "service.name" && attr.Value.StringValue != nil {
			serviceName = *attr.Value.StringValue
		}
		if attr.Key == "service.namespace" && attr.Value.StringValue != nil {
			namespace = *attr.Value.StringValue
		}
	}

	if namespace != "" {
		return namespace + "/" + serviceName
	}
	return serviceName
}

func getServiceName(attributes []OTLPAttribute) string {
	for _, attr := range attributes {
		if attr.Key == "service.name" && attr.Value.StringValue != nil {
			return *attr.Value.StringValue
		}
	}
	return "unknown_service"
}

func getServiceNamespace(attributes []OTLPAttribute) string {
	for _, attr := range attributes {
		if attr.Key == "service.namespace" && attr.Value.StringValue != nil {
			return *attr.Value.StringValue
		}
	}
	return ""
}

func convertAttributes(attributes []OTLPAttribute) map[string]interface{} {
	result := make(map[string]interface{})
	for _, attr := range attributes {
		switch {
		case attr.Value.StringValue != nil:
			result[attr.Key] = *attr.Value.StringValue
		case attr.Value.BoolValue != nil:
			result[attr.Key] = *attr.Value.BoolValue
		case attr.Value.IntValue != nil:
			result[attr.Key] = attr.Value.IntValue
		case attr.Value.DoubleValue != nil:
			result[attr.Key] = *attr.Value.DoubleValue
		}
	}
	return result
}

func parseUnixNano(timeStr string) (time.Time, error) {
	var nano int64
	_, err := fmt.Sscanf(timeStr, "%d", &nano)
	if err != nil {
		return time.Time{}, err
	}
	return time.Unix(0, nano), nil
}

func getSpanKindName(kind int) string {
	switch kind {
	case 0:
		return "SPAN_KIND_UNSPECIFIED"
	case 1:
		return "SPAN_KIND_INTERNAL"
	case 2:
		return "SPAN_KIND_SERVER"
	case 3:
		return "SPAN_KIND_CLIENT"
	case 4:
		return "SPAN_KIND_PRODUCER"
	case 5:
		return "SPAN_KIND_CONSUMER"
	default:
		return "SPAN_KIND_UNSPECIFIED"
	}
}
