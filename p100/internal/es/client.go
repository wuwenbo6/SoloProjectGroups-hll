package es

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/elastic/go-elasticsearch/v8"
	"github.com/elastic/go-elasticsearch/v8/esapi"
	"go.uber.org/zap"
)

type Client struct {
	es     *elasticsearch.Client
	prefix string
	logger *zap.Logger
}

func NewClient(url, prefix string, logger *zap.Logger) (*Client, error) {
	cfg := elasticsearch.Config{
		Addresses: []string{url},
	}

	es, err := elasticsearch.NewClient(cfg)
	if err != nil {
		return nil, err
	}

	res, err := es.Info()
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.IsError() {
		return nil, fmt.Errorf("elasticsearch error: %s", res.Status())
	}

	client := &Client{
		es:     es,
		prefix: prefix,
		logger: logger,
	}

	if err := client.createIndices(); err != nil {
		logger.Warn("Failed to create indices", zap.Error(err))
	}

	return client, nil
}

func (c *Client) createIndices() error {
	indices := []struct {
		name string
		mapping string
	}{
		{
			name: c.prefix + "_logs",
			mapping: `{
				"mappings": {
					"properties": {
						"id": {"type": "keyword"},
						"timestamp": {"type": "date"},
						"source": {"type": "keyword"},
						"severity": {"type": "keyword"},
						"message": {"type": "text"},
						"hostname": {"type": "keyword"},
						"facility": {"type": "keyword"}
					}
				}
			}`,
		},
		{
			name: c.prefix + "_events",
			mapping: `{
				"mappings": {
					"properties": {
						"id": {"type": "keyword"},
						"type": {"type": "keyword"},
						"timestamp": {"type": "date"},
						"log_entry_id": {"type": "keyword"},
						"hostname": {"type": "keyword"},
						"source": {"type": "keyword"}
					}
				}
			}`,
		},
		{
			name: c.prefix + "_alerts",
			mapping: `{
				"mappings": {
					"properties": {
						"id": {"type": "keyword"},
						"rule_id": {"type": "keyword"},
						"rule_name": {"type": "keyword"},
						"severity": {"type": "keyword"},
						"timestamp": {"type": "date"},
						"event_ids": {"type": "keyword"},
						"description": {"type": "text"},
						"status": {"type": "keyword"}
					}
				}
			}`,
		},
		{
			name: c.prefix + "_rules",
			mapping: `{
				"mappings": {
					"properties": {
						"id": {"type": "keyword"},
						"name": {"type": "keyword"},
						"description": {"type": "text"},
						"severity": {"type": "keyword"},
						"enabled": {"type": "boolean"},
						"created_at": {"type": "date"},
						"updated_at": {"type": "date"},
						"event_type": {"type": "keyword"}
					}
				}
			}`,
		},
	}

	for _, idx := range indices {
		req := esapi.IndicesCreateRequest{
			Index: idx.name,
			Body:  strings.NewReader(idx.mapping),
		}

		res, err := req.Do(context.Background(), c.es)
		if err != nil {
			log.Printf("Failed to create index %s: %v", idx.name, err)
			continue
		}
		res.Body.Close()
	}

	return nil
}

func (c *Client) getIndexName(docType string) string {
	date := time.Now().Format("2006.01.02")
	return fmt.Sprintf("%s_%s-%s", c.prefix, docType, date)
}

func (c *Client) IndexDocument(docType, id string, doc interface{}) error {
	data, err := json.Marshal(doc)
	if err != nil {
		return err
	}

	indexName := c.getIndexName(docType)

	req := esapi.IndexRequest{
		Index:      indexName,
		DocumentID: id,
		Body:       bytes.NewReader(data),
		Refresh:    "true",
	}

	res, err := req.Do(context.Background(), c.es)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.IsError() {
		return fmt.Errorf("failed to index document: %s", res.Status())
	}

	return nil
}

func (c *Client) Search(docType string, query map[string]interface{}, size int) ([]map[string]interface{}, error) {
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(query); err != nil {
		return nil, err
	}

	indexPattern := fmt.Sprintf("%s_%s-*", c.prefix, docType)

	req := esapi.SearchRequest{
		Index: []string{indexPattern},
		Body:  &buf,
		Size:  &size,
		Sort:  []string{"timestamp:desc"},
	}

	res, err := req.Do(context.Background(), c.es)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.IsError() {
		return nil, fmt.Errorf("search error: %s", res.Status())
	}

	var result map[string]interface{}
	if err := json.NewDecoder(res.Body).Decode(&result); err != nil {
		return nil, err
	}

	hits := result["hits"].(map[string]interface{})["hits"].([]interface{})
	docs := make([]map[string]interface{}, 0, len(hits))

	for _, hit := range hits {
		source := hit.(map[string]interface{})["_source"]
		docs = append(docs, source.(map[string]interface{}))
	}

	return docs, nil
}

func (c *Client) Get(docType, id string) (map[string]interface{}, error) {
	indexPattern := fmt.Sprintf("%s_%s-*", c.prefix, docType)

	req := esapi.GetRequest{
		Index:      indexPattern,
		DocumentID: id,
	}

	res, err := req.Do(context.Background(), c.es)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.IsError() {
		return nil, fmt.Errorf("get error: %s", res.Status())
	}

	var result map[string]interface{}
	if err := json.NewDecoder(res.Body).Decode(&result); err != nil {
		return nil, err
	}

	return result["_source"].(map[string]interface{}), nil
}

func (c *Client) Update(docType, id string, doc map[string]interface{}) error {
	indexPattern := fmt.Sprintf("%s_%s-*", c.prefix, docType)

	var buf bytes.Buffer
	update := map[string]interface{}{"doc": doc}
	if err := json.NewEncoder(&buf).Encode(update); err != nil {
		return err
	}

	req := esapi.UpdateByQueryRequest{
		Index: []string{indexPattern},
		Body:  bytes.NewReader([]byte(fmt.Sprintf(`{"query":{"term":{"id":"%s"}},"script":{"source":"ctx._source.putAll(params)","params":%s}}`, id, buf.String()))),
	}

	res, err := req.Do(context.Background(), c.es)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.IsError() {
		return fmt.Errorf("update error: %s", res.Status())
	}

	return nil
}
