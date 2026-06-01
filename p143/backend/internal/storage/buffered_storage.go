package storage

import (
	"context"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"trace-backend/pkg/model"
)

const (
	DefaultQueueSize    = 100000
	DefaultWorkerCount  = 10
	DefaultBatchSize    = 500
	DefaultFlushInterval = 5 * time.Second
)

type BufferedStorage struct {
	esStorage *ElasticsearchStorage
	
	queue     chan *model.Span
	wg        sync.WaitGroup
	
	workerCount int
	batchSize   int
	flushInterval time.Duration
	
	totalQueued    int64
	totalProcessed int64
	totalDropped   int64
	totalErrors    int64
	
	ctx    context.Context
	cancel context.CancelFunc
	
	running bool
	mu      sync.RWMutex
}

type BufferedStorageConfig struct {
	QueueSize     int
	WorkerCount   int
	BatchSize     int
	FlushInterval time.Duration
}

func NewBufferedStorage(esStorage *ElasticsearchStorage, config *BufferedStorageConfig) *BufferedStorage {
	if config == nil {
		config = &BufferedStorageConfig{
			QueueSize:     DefaultQueueSize,
			WorkerCount:   DefaultWorkerCount,
			BatchSize:     DefaultBatchSize,
			FlushInterval: DefaultFlushInterval,
		}
	}

	if config.QueueSize <= 0 {
		config.QueueSize = DefaultQueueSize
	}
	if config.WorkerCount <= 0 {
		config.WorkerCount = DefaultWorkerCount
	}
	if config.BatchSize <= 0 {
		config.BatchSize = DefaultBatchSize
	}
	if config.FlushInterval <= 0 {
		config.FlushInterval = DefaultFlushInterval
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &BufferedStorage{
		esStorage:    esStorage,
		queue:        make(chan *model.Span, config.QueueSize),
		workerCount:  config.WorkerCount,
		batchSize:    config.BatchSize,
		flushInterval: config.FlushInterval,
		ctx:          ctx,
		cancel:       cancel,
	}
}

func (bs *BufferedStorage) Start() {
	bs.mu.Lock()
	defer bs.mu.Unlock()

	if bs.running {
		return
	}

	bs.running = true
	for i := 0; i < bs.workerCount; i++ {
		bs.wg.Add(1)
		go bs.worker(i)
	}

	log.Printf("BufferedStorage started with %d workers, queue size: %d, batch size: %d",
		bs.workerCount, cap(bs.queue), bs.batchSize)
}

func (bs *BufferedStorage) Stop() {
	bs.mu.Lock()
	defer bs.mu.Unlock()

	if !bs.running {
		return
	}

	log.Println("BufferedStorage stopping...")
	bs.cancel()
	close(bs.queue)
	bs.wg.Wait()
	bs.running = false
	log.Println("BufferedStorage stopped")
}

func (bs *BufferedStorage) QueueSpan(span *model.Span) error {
	select {
	case bs.queue <- span:
		atomic.AddInt64(&bs.totalQueued, 1)
		return nil
	default:
		atomic.AddInt64(&bs.totalDropped, 1)
		if atomic.LoadInt64(&bs.totalDropped)%100 == 0 {
			log.Printf("Warning: queue overflow, dropped %d spans (queue size: %d)",
				atomic.LoadInt64(&bs.totalDropped), len(bs.queue))
		}
		return &QueueFullError{QueueSize: len(bs.queue)}
	}
}

func (bs *BufferedStorage) QueueSpans(spans []*model.Span) int {
	queued := 0
	for _, span := range spans {
		select {
		case bs.queue <- span:
			queued++
			atomic.AddInt64(&bs.totalQueued, 1)
		default:
			atomic.AddInt64(&bs.totalDropped, 1)
		}
	}
	return queued
}

type QueueStats struct {
	QueueSize       int   `json:"queue_size"`
	QueueCapacity   int   `json:"queue_capacity"`
	TotalQueued     int64 `json:"total_queued"`
	TotalProcessed  int64 `json:"total_processed"`
	TotalDropped    int64 `json:"total_dropped"`
	TotalErrors     int64 `json:"total_errors"`
	WorkerCount     int   `json:"worker_count"`
}

func (bs *BufferedStorage) GetStats() QueueStats {
	return QueueStats{
		QueueSize:      len(bs.queue),
		QueueCapacity:  cap(bs.queue),
		TotalQueued:    atomic.LoadInt64(&bs.totalQueued),
		TotalProcessed: atomic.LoadInt64(&bs.totalProcessed),
		TotalDropped:   atomic.LoadInt64(&bs.totalDropped),
		TotalErrors:    atomic.LoadInt64(&bs.totalErrors),
		WorkerCount:    bs.workerCount,
	}
}

func (bs *BufferedStorage) worker(id int) {
	defer bs.wg.Done()

	batch := make([]*model.Span, 0, bs.batchSize)
	flushTimer := time.NewTicker(bs.flushInterval)
	defer flushTimer.Stop()

	for {
		select {
		case span, ok := <-bs.queue:
			if !ok {
				if len(batch) > 0 {
					bs.flushBatch(batch, id)
				}
				return
			}

			batch = append(batch, span)

			if len(batch) >= bs.batchSize {
				bs.flushBatch(batch, id)
				batch = make([]*model.Span, 0, bs.batchSize)
			}

		case <-flushTimer.C:
			if len(batch) > 0 {
				bs.flushBatch(batch, id)
				batch = make([]*model.Span, 0, bs.batchSize)
			}

		case <-bs.ctx.Done():
			if len(batch) > 0 {
				bs.flushBatch(batch, id)
			}
			return
		}
	}
}

func (bs *BufferedStorage) flushBatch(batch []*model.Span, workerID int) {
	if len(batch) == 0 {
		return
	}

	ctx := context.Background()
	
	retries := 3
	var lastErr error

	for retry := 0; retry < retries; retry++ {
		err := bs.esStorage.StoreSpans(ctx, batch)
		if err == nil {
			atomic.AddInt64(&bs.totalProcessed, int64(len(batch)))
			return
		}
		lastErr = err
		log.Printf("Worker %d: failed to store batch (retry %d/%d): %v", workerID, retry+1, retries, err)
		time.Sleep(time.Duration(retry+1) * 100 * time.Millisecond)
	}

	atomic.AddInt64(&bs.totalErrors, int64(len(batch)))
	log.Printf("Worker %d: batch storage failed after %d retries, lost %d spans: %v",
		workerID, retries, len(batch), lastErr)
}

type QueueFullError struct {
	QueueSize int
}

func (e *QueueFullError) Error() string {
	return "queue is full, span dropped"
}
