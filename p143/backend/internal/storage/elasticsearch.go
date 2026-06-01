package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/olivere/elastic/v7"
	"trace-backend/pkg/model"
)

const (
	spansIndex = "spans"
)

type ElasticsearchStorage struct {
	client *elastic.Client
}

func NewElasticsearchStorage(urls []string) (*ElasticsearchStorage, error) {
	client, err := elastic.NewClient(
		elastic.SetURL(urls...),
		elastic.SetSniff(false),
		elastic.SetHealthcheck(false),
	)
	if err != nil {
		return nil, err
	}

	storage := &ElasticsearchStorage{client: client}
	if err := storage.createIndex(); err != nil {
		log.Printf("Warning: failed to create index: %v", err)
	}

	return storage, nil
}

func (s *ElasticsearchStorage) createIndex() error {
	ctx := context.Background()

	exists, err := s.client.IndexExists(spansIndex).Do(ctx)
	if err != nil {
		return err
	}

	if exists {
		return nil
	}

	mapping := `{
		"mappings": {
			"properties": {
				"trace_id": {"type": "keyword"},
				"span_id": {"type": "keyword"},
				"parent_span_id": {"type": "keyword"},
				"service_name": {"type": "keyword"},
				"name": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
				"kind": {"type": "keyword"},
				"start_time": {"type": "date"},
				"end_time": {"type": "date"},
				"duration": {"type": "long"},
				"attributes": {"type": "object", "enabled": true},
				"status": {
					"properties": {
						"code": {"type": "keyword"},
						"description": {"type": "text"}
					}
				}
			}
		}
	}`

	_, err = s.client.CreateIndex(spansIndex).Body(mapping).Do(ctx)
	return err
}

func (s *ElasticsearchStorage) StoreSpan(ctx context.Context, span *model.Span) error {
	_, err := s.client.Index().
		Index(spansIndex).
		Id(span.SpanID).
		BodyJson(span).
		Do(ctx)
	return err
}

func (s *ElasticsearchStorage) StoreSpans(ctx context.Context, spans []*model.Span) error {
	bulk := s.client.Bulk()
	for _, span := range spans {
		req := elastic.NewBulkIndexRequest().
			Index(spansIndex).
			Id(span.SpanID).
			Doc(span)
		bulk.Add(req)
	}

	_, err := bulk.Do(ctx)
	return err
}

func (s *ElasticsearchStorage) GetTraceByID(ctx context.Context, traceID string) (*model.Trace, error) {
	query := elastic.NewTermQuery("trace_id", traceID)
	sort := elastic.NewFieldSort("start_time").Asc()

	result, err := s.client.Search().
		Index(spansIndex).
		Query(query).
		SortBy(sort).
		Size(1000).
		Do(ctx)
	if err != nil {
		return nil, err
	}

	if result.TotalHits() == 0 {
		return nil, fmt.Errorf("trace not found: %s", traceID)
	}

	spans := make([]model.Span, 0, result.TotalHits())
	for _, hit := range result.Hits.Hits {
		var span model.Span
		if err := json.Unmarshal(hit.Source, &span); err != nil {
			continue
		}
		spans = append(spans, span)
	}

	return &model.Trace{
		TraceID: traceID,
		Spans:   spans,
	}, nil
}

func (s *ElasticsearchStorage) SearchTraces(ctx context.Context, serviceName, operation string, limit int) ([]*model.Trace, error) {
	boolQuery := elastic.NewBoolQuery()

	if serviceName != "" {
		boolQuery.Must(elastic.NewTermQuery("service_name", serviceName))
	}
	if operation != "" {
		boolQuery.Must(elastic.NewMatchQuery("name", operation))
	}

	aggs := elastic.NewTermsAggregation().Field("trace_id").Size(limit).
		OrderByAggregate("max_start_time", false)
	aggs.SubAggregation("max_start_time", elastic.NewMaxAggregation().Field("start_time"))

	result, err := s.client.Search().
		Index(spansIndex).
		Query(boolQuery).
		Aggregation("trace_ids", aggs).
		Size(0).
		Do(ctx)
	if err != nil {
		return nil, err
	}

	aggResult, found := result.Aggregations.Terms("trace_ids")
	if !found {
		return []*model.Trace{}, nil
	}

	traces := make([]*model.Trace, 0, len(aggResult.Buckets))
	for _, bucket := range aggResult.Buckets {
		traceID := bucket.Key.(string)
		trace, err := s.GetTraceByID(ctx, traceID)
		if err != nil {
			continue
		}
		traces = append(traces, trace)
	}

	return traces, nil
}

func (s *ElasticsearchStorage) GetServices(ctx context.Context) ([]string, error) {
	aggs := elastic.NewTermsAggregation().Field("service_name").Size(100)

	result, err := s.client.Search().
		Index(spansIndex).
		Aggregation("services", aggs).
		Size(0).
		Do(ctx)
	if err != nil {
		return nil, err
	}

	aggResult, found := result.Aggregations.Terms("services")
	if !found {
		return []string{}, nil
	}

	services := make([]string, 0, len(aggResult.Buckets))
	for _, bucket := range aggResult.Buckets {
		services = append(services, bucket.Key.(string))
	}

	return services, nil
}

func (s *ElasticsearchStorage) GetOperations(ctx context.Context, serviceName string) ([]string, error) {
	boolQuery := elastic.NewBoolQuery()
	if serviceName != "" {
		boolQuery.Must(elastic.NewTermQuery("service_name", serviceName))
	}

	aggs := elastic.NewTermsAggregation().Field("name.keyword").Size(100)

	result, err := s.client.Search().
		Index(spansIndex).
		Query(boolQuery).
		Aggregation("operations", aggs).
		Size(0).
		Do(ctx)
	if err != nil {
		return nil, err
	}

	aggResult, found := result.Aggregations.Terms("operations")
	if !found {
		return []string{}, nil
	}

	operations := make([]string, 0, len(aggResult.Buckets))
	for _, bucket := range aggResult.Buckets {
		operations = append(operations, bucket.Key.(string))
	}

	return operations, nil
}

func (s *ElasticsearchStorage) GetServiceDependencies(ctx context.Context, startTime, endTime time.Time) ([]model.ServiceDependency, error) {
	boolQuery := elastic.NewBoolQuery()
	boolQuery.Must(elastic.NewRangeQuery("start_time").Gte(startTime).Lte(endTime))
	boolQuery.Must(elastic.NewExistsQuery("parent_span_id"))

	query := elastic.NewNestedQuery("attributes",
		elastic.NewBoolQuery().
			Must(elastic.NewTermQuery("attributes.http.method.keyword", "GET")),
	)
	_ = query

	parentChildAgg := elastic.NewTermsAggregation().
		Field("service_name").
		Size(100).
		SubAggregation("child_services",
			elastic.NewTermsAggregation().
				Script(elastic.NewScript("params._source.parent_span_id != null ? params._source.service_name : 'unknown'")).
				Size(100))

	result, err := s.client.Search().
		Index(spansIndex).
		Query(boolQuery).
		Aggregation("service_relations", parentChildAgg).
		Size(10000).
		Do(ctx)
	if err != nil {
		return nil, err
	}

	spanParentMap := make(map[string]string)
	spanServiceMap := make(map[string]string)

	searchResult, err := s.client.Search().
		Index(spansIndex).
		Query(elastic.NewRangeQuery("start_time").Gte(startTime).Lte(endTime)).
		Size(10000).
		Do(ctx)
	if err != nil {
		return nil, err
	}

	for _, hit := range searchResult.Hits.Hits {
		var span model.Span
		if err := json.Unmarshal(hit.Source, &span); err != nil {
			continue
		}
		spanServiceMap[span.SpanID] = span.ServiceName
		if span.ParentSpanID != "" {
			spanParentMap[span.SpanID] = span.ParentSpanID
		}
	}

	depMap := make(map[string]map[string]int64)
	for childSpanID, parentSpanID := range spanParentMap {
		childService := spanServiceMap[childSpanID]
		parentService := spanServiceMap[parentSpanID]
		if parentService != "" && childService != "" && parentService != childService {
			if depMap[parentService] == nil {
				depMap[parentService] = make(map[string]int64)
			}
			depMap[parentService][childService]++
		}
	}

	var dependencies []model.ServiceDependency
	for client, servers := range depMap {
		for server, count := range servers {
			dependencies = append(dependencies, model.ServiceDependency{
				Client: client,
				Server: server,
				Count:  count,
			})
		}
	}

	return dependencies, nil
}

func (s *ElasticsearchStorage) GetRecentTraces(ctx context.Context, limit int) ([]*model.Trace, error) {
	aggs := elastic.NewTermsAggregation().
		Field("trace_id").
		Size(limit).
		OrderByAggregate("max_start_time", false)
	aggs.SubAggregation("max_start_time", elastic.NewMaxAggregation().Field("start_time"))

	result, err := s.client.Search().
		Index(spansIndex).
		Aggregation("trace_ids", aggs).
		Size(0).
		Do(ctx)
	if err != nil {
		return nil, err
	}

	aggResult, found := result.Aggregations.Terms("trace_ids")
	if !found {
		return []*model.Trace{}, nil
	}

	traces := make([]*model.Trace, 0, len(aggResult.Buckets))
	for _, bucket := range aggResult.Buckets {
		traceID, ok := bucket.Key.(string)
		if !ok {
			continue
		}
		trace, err := s.GetTraceByID(ctx, traceID)
		if err != nil {
			continue
		}
		traces = append(traces, trace)
	}

	return traces, nil
}
