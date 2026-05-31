package metrics

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"time"

	"dbprobe/pkg/tracker"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type Exporter struct {
	queryCount        *prometheus.CounterVec
	queryDuration     *prometheus.HistogramVec
	slowQueryCount    *prometheus.CounterVec
	activeConnections *prometheus.GaugeVec
	lostEvents        prometheus.Counter
	registry          *prometheus.Registry
	server            *http.Server
	addr              string
}

func NewExporter(addr string) *Exporter {
	registry := prometheus.NewRegistry()

	queryCount := prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "dbprobe_queries_total",
			Help: "Total number of database queries observed",
		},
		[]string{"db_type", "database", "client_ip", "server_ip"},
	)

	queryDuration := prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "dbprobe_query_duration_seconds",
			Help:    "Query execution duration in seconds",
			Buckets: prometheus.ExponentialBuckets(0.001, 2, 15),
		},
		[]string{"db_type", "database", "client_ip", "server_ip"},
	)

	slowQueryCount := prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "dbprobe_slow_queries_total",
			Help: "Total number of slow queries (over threshold)",
		},
		[]string{"db_type", "database", "client_ip", "server_ip"},
	)

	activeConnections := prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "dbprobe_active_connections",
			Help: "Number of active database connections",
		},
		[]string{"db_type", "server_ip", "server_port"},
	)

	lostEvents := prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "dbprobe_lost_events_total",
			Help: "Total number of lost events due to ring buffer overflow",
		},
	)

	registry.MustRegister(queryCount)
	registry.MustRegister(queryDuration)
	registry.MustRegister(slowQueryCount)
	registry.MustRegister(activeConnections)
	registry.MustRegister(lostEvents)

	return &Exporter{
		queryCount:        queryCount,
		queryDuration:     queryDuration,
		slowQueryCount:    slowQueryCount,
		activeConnections: activeConnections,
		lostEvents:        lostEvents,
		registry:          registry,
		addr:              addr,
	}
}

func (e *Exporter) Start() error {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.HandlerFor(e.registry, promhttp.HandlerOpts{}))

	e.server = &http.Server{
		Addr:    e.addr,
		Handler: mux,
	}

	go func() {
		if err := e.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		}
	}()

	return nil
}

func (e *Exporter) Stop() error {
	if e.server != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return e.server.Shutdown(ctx)
	}
	return nil
}

func (e *Exporter) ObserveQuery(event tracker.QueryEvent) {
	labels := prometheus.Labels{
		"db_type":   event.DBType,
		"database":  event.Database,
		"client_ip": ipToString(event.ClientIP),
		"server_ip": ipToString(event.ServerIP),
	}

	e.queryCount.With(labels).Inc()
	e.queryDuration.With(labels).Observe(event.Duration.Seconds())

	if event.OverThreshold {
		e.slowQueryCount.With(labels).Inc()
	}
}

func (e *Exporter) AddLostEvents(count uint64) {
	e.lostEvents.Add(float64(count))
}

func (e *Exporter) UpdateActiveConnections(dbType string, serverIP net.IP, serverPort uint16, count float64) {
	labels := prometheus.Labels{
		"db_type":     dbType,
		"server_ip":   ipToString(serverIP),
		"server_port": uint16ToString(serverPort),
	}
	e.activeConnections.With(labels).Set(count)
}

func ipToString(ip net.IP) string {
	if ip == nil {
		return "unknown"
	}
	return ip.String()
}

func uint16ToString(port uint16) string {
	return fmt.Sprintf("%d", port)
}
