package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"dbprobe/pkg/analyzer"
	"dbprobe/pkg/dbconnector"
	"dbprobe/pkg/ebpf"
	"dbprobe/pkg/metrics"
	"dbprobe/pkg/slowlog"
	"dbprobe/pkg/tracker"

	"github.com/spf13/cobra"
)

var (
	threshold          time.Duration
	prometheusAddr     string
	showAll            bool
	outputFormat       string
	enableKprobes      bool
	enableUprobeSSL    bool
	enableUprobeMySQL  bool
	enableUprobePG     bool
	mysqlBinary        string
	postgresBinary     string
	sslBinary          string
	showStats          bool
	statsInterval      time.Duration

	enableAnalysis     bool
	enableIndexSuggest bool

	slowLogEnabled     bool
	slowLogPath        string
	slowLogFormat      string
	slowLogRotation    int64
	slowLogRotationCount int

	autoKillEnabled    bool
	autoKillThreshold  time.Duration
	autoKillDryRun     bool
	autoKillDBType     string
	autoKillDBHost     string
	autoKillDBPort     int
	autoKillDBUser     string
	autoKillDBPass     string
	autoKillDBDatabase string
	autoKillCheckInterval time.Duration
)

var rootCmd = &cobra.Command{
	Use:   "dbprobe",
	Short: "eBPF-based MySQL/PostgreSQL query monitor with analysis",
	Long: `dbprobe is an eBPF-based tool for monitoring MySQL and PostgreSQL queries.

Features:
  - Slow query detection with configurable threshold
  - SQL analysis and index suggestions
  - Auto-kill stuck/long-running queries
  - Slow query log export (MySQL/PostgreSQL/CSV/JSON formats)
  - Prometheus metrics integration
  - TLS support via uprobes`,
	Run: runProbe,
}

func init() {
	rootCmd.Flags().DurationVarP(&threshold, "threshold", "t", 100*time.Millisecond,
		"Threshold for slow query detection (e.g., 100ms, 1s)")
	rootCmd.Flags().StringVarP(&prometheusAddr, "prometheus", "p", ":9090",
		"Prometheus metrics exporter address")
	rootCmd.Flags().BoolVarP(&showAll, "all", "a", false,
		"Show all queries, not just slow ones")
	rootCmd.Flags().StringVarP(&outputFormat, "format", "f", "text",
		"Output format: text, json")

	rootCmd.Flags().BoolVar(&enableKprobes, "kprobes", true,
		"Enable kernel probes (sys_recvfrom/sys_sendto)")
	rootCmd.Flags().BoolVar(&enableUprobeSSL, "uprobe-ssl", false,
		"Enable SSL uprobes (SSL_read/SSL_write)")
	rootCmd.Flags().BoolVar(&enableUprobeMySQL, "uprobe-mysql", false,
		"Enable MySQL function uprobes (dispatch_command)")
	rootCmd.Flags().BoolVar(&enableUprobePG, "uprobe-postgres", false,
		"Enable PostgreSQL function uprobes (exec_simple_query)")

	rootCmd.Flags().StringVar(&mysqlBinary, "mysql-binary", "/usr/sbin/mysqld",
		"Path to MySQL binary for uprobes")
	rootCmd.Flags().StringVar(&postgresBinary, "postgres-binary", "/usr/bin/postgres",
		"Path to PostgreSQL binary for uprobes")
	rootCmd.Flags().StringVar(&sslBinary, "ssl-binary", "",
		"Path to SSL library (e.g., /usr/lib/x86_64-linux-gnu/libssl.so.3)")

	rootCmd.Flags().BoolVar(&showStats, "stats", true,
		"Show periodic statistics")
	rootCmd.Flags().DurationVar(&statsInterval, "stats-interval", 10*time.Second,
		"Statistics display interval")

	rootCmd.Flags().BoolVar(&enableAnalysis, "analysis", true,
		"Enable SQL query analysis")
	rootCmd.Flags().BoolVar(&enableIndexSuggest, "index-suggest", true,
		"Show index suggestions for slow queries")

	rootCmd.Flags().BoolVar(&slowLogEnabled, "slowlog", false,
		"Enable slow query log export")
	rootCmd.Flags().StringVar(&slowLogPath, "slowlog-path", "./slowquery.log",
		"Slow query log file path")
	rootCmd.Flags().StringVar(&slowLogFormat, "slowlog-format", "mysql",
		"Slow log format: mysql, postgres, csv, json")
	rootCmd.Flags().Int64Var(&slowLogRotation, "slowlog-rotation", 100*1024*1024,
		"Slow log rotation size in bytes")
	rootCmd.Flags().IntVar(&slowLogRotationCount, "slowlog-rotation-count", 5,
		"Number of rotated log files to keep")

	rootCmd.Flags().BoolVar(&autoKillEnabled, "auto-kill", false,
		"Enable auto-kill for long-running queries")
	rootCmd.Flags().DurationVar(&autoKillThreshold, "auto-kill-threshold", 5*time.Minute,
		"Auto-kill queries running longer than this")
	rootCmd.Flags().BoolVar(&autoKillDryRun, "auto-kill-dry-run", true,
		"Dry-run mode (don't actually kill queries)")
	rootCmd.Flags().StringVar(&autoKillDBType, "auto-kill-db-type", "mysql",
		"Database type for auto-kill: mysql, postgres")
	rootCmd.Flags().StringVar(&autoKillDBHost, "auto-kill-host", "127.0.0.1",
		"Database host for auto-kill")
	rootCmd.Flags().IntVar(&autoKillDBPort, "auto-kill-port", 3306,
		"Database port for auto-kill")
	rootCmd.Flags().StringVar(&autoKillDBUser, "auto-kill-user", "root",
		"Database user for auto-kill")
	rootCmd.Flags().StringVar(&autoKillDBPass, "auto-kill-password", "",
		"Database password for auto-kill")
	rootCmd.Flags().StringVar(&autoKillDBDatabase, "auto-kill-db", "",
		"Database name for auto-kill")
	rootCmd.Flags().DurationVar(&autoKillCheckInterval, "auto-kill-interval", 30*time.Second,
		"Interval to check for long-running queries")
}

func runProbe(cmd *cobra.Command, args []string) {
	fmt.Printf("dbprobe - eBPF Database Query Monitor\n")
	fmt.Printf("═══════════════════════════════════════════════════════════\n")
	fmt.Printf("Threshold:          %v\n", threshold)
	fmt.Printf("Prometheus:         %s\n", prometheusAddr)
	fmt.Printf("Kernel probes:      %v\n", enableKprobes)
	fmt.Printf("SSL uprobes:        %v\n", enableUprobeSSL)
	fmt.Printf("MySQL uprobes:      %v\n", enableUprobeMySQL)
	fmt.Printf("PostgreSQL uprobes: %v\n", enableUprobePG)
	fmt.Printf("SQL Analysis:       %v\n", enableAnalysis)
	fmt.Printf("Index Suggestions:  %v\n", enableIndexSuggest)
	fmt.Printf("Slow Log Export:    %v\n", slowLogEnabled)
	if slowLogEnabled {
		fmt.Printf("  Path:             %s\n", slowLogPath)
		fmt.Printf("  Format:           %s\n", slowLogFormat)
	}
	fmt.Printf("Auto-Kill:          %v\n", autoKillEnabled)
	if autoKillEnabled {
		fmt.Printf("  Threshold:        %v\n", autoKillThreshold)
		fmt.Printf("  Dry Run:          %v\n", autoKillDryRun)
		fmt.Printf("  DB:               %s@%s:%d\n", autoKillDBUser, autoKillDBHost, autoKillDBPort)
	}
	fmt.Printf("═══════════════════════════════════════════════════════════\n")
	fmt.Println("Press Ctrl+C to exit")
	fmt.Println()

	config := ebpf.DefaultConfig()
	config.EnableKprobes = enableKprobes
	config.EnableUprobeSSL = enableUprobeSSL
	config.EnableUprobeMySQL = enableUprobeMySQL
	config.EnableUprobePostgres = enableUprobePG
	config.MySQLBinaryPath = mysqlBinary
	config.PostgresBinaryPath = postgresBinary
	config.SSLBinaryPath = sslBinary

	probe, err := ebpf.NewProbe(config)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating eBPF probe: %v\n", err)
		fmt.Fprintf(os.Stderr, "\nNote: This program requires:\n")
		fmt.Fprintf(os.Stderr, "  - Root privileges (run with sudo)\n")
		fmt.Fprintf(os.Stderr, "  - Linux kernel >= 5.8\n")
		fmt.Fprintf(os.Stderr, "  - BTF debug symbols (kernel-devel package)\n")
		os.Exit(1)
	}
	defer probe.Stop()

	track := tracker.NewTracker(threshold)
	defer track.Stop()

	exporter := metrics.NewExporter(prometheusAddr)
	if err := exporter.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Could not start Prometheus exporter: %v\n", err)
	}
	defer exporter.Stop()

	var sqlAnalyzer *analyzer.Analyzer
	if enableAnalysis || enableIndexSuggest {
		sqlAnalyzer = analyzer.NewAnalyzer()
	}

	var slowLogExporter *slowlog.Exporter
	if slowLogEnabled {
		slowConfig := slowlog.Config{
			Enabled:                true,
			FilePath:               slowLogPath,
			Format:                 slowlog.LogFormat(slowLogFormat),
			RotationSize:           slowLogRotation,
			RotationCount:          slowLogRotationCount,
			IncludeIndexSuggestions: enableIndexSuggest,
		}
		slowLogExporter, err = slowlog.NewExporter(slowConfig)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Warning: Could not create slow log exporter: %v\n", err)
		} else {
			defer slowLogExporter.Close()
		}
	}

	var killer *dbconnector.Killer
	if autoKillEnabled {
		killer = dbconnector.NewKiller()
		dbConfig := dbconnector.DBConfig{
			DBType:       autoKillDBType,
			Host:         autoKillDBHost,
			Port:         autoKillDBPort,
			User:         autoKillDBUser,
			Password:     autoKillDBPass,
			Database:     autoKillDBDatabase,
			MaxOpenConns: 5,
			MaxIdleConns: 2,
		}
		if err := killer.AddConnector("main", dbConfig); err != nil {
			fmt.Fprintf(os.Stderr, "Warning: Could not connect to database for auto-kill: %v\n", err)
			fmt.Fprintf(os.Stderr, "  Auto-kill feature disabled\n")
			killer = nil
		} else {
			killer.SetAutoKill(true, autoKillThreshold, autoKillDryRun)
			defer killer.Close()
		}
	}

	probe.Start()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	cleanupTicker := time.NewTicker(30 * time.Second)
	defer cleanupTicker.Stop()

	statsTicker := time.NewTicker(statsInterval)
	defer statsTicker.Stop()

	var killTicker *time.Ticker
	if killer != nil {
		killTicker = time.NewTicker(autoKillCheckInterval)
		defer killTicker.Stop()
	}

	lastLostWarning := time.Time{}

	for {
		select {
		case <-sigChan:
			fmt.Println("\n═══════════════════════════════════════════════════════")
			fmt.Println("Shutting down...")
			printFinalStats(track, probe, killer)
			return

		case <-cleanupTicker.C:
			track.CleanupOldQueries(5 * time.Minute)

		case <-statsTicker.C:
			if showStats {
				printStats(track, probe, killer)
			}

		case <-killTicker.C:
			if killer != nil {
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				killed, err := killer.CheckAndKill(ctx)
				cancel()
				if err == nil && len(killed) > 0 {
					fmt.Fprintf(os.Stderr, "\n🔫 Auto-killed %d long-running queries:\n", len(killed))
					for _, q := range killed {
						truncatedSQL := q.Info
						if len(truncatedSQL) > 80 {
							truncatedSQL = truncatedSQL[:80] + "..."
						}
						fmt.Fprintf(os.Stderr, "  - ID: %d, User: %s, Time: %ds, SQL: %s\n",
							q.ID, q.User, q.Time, truncatedSQL)
					}
				}
			}

		case lost, ok := <-probe.LostEvents():
			if !ok {
				return
			}
			track.AddLostEvents(lost)
			exporter.AddLostEvents(lost)
			if time.Since(lastLostWarning) > 5*time.Second {
				fmt.Fprintf(os.Stderr, "\n⚠️  WARNING: Lost %d events (ring buffer full!)\n", lost)
				fmt.Fprintf(os.Stderr, "   Consider: increasing buffer size, reducing sample rate, or using uprobes\n")
				lastLostWarning = time.Now()
			}

		case event, ok := <-probe.Events():
			if !ok {
				return
			}
			track.ProcessEvent(event)

		case queryEvent, ok := <-track.QueryEvents():
			if !ok {
				return
			}

			exporter.ObserveQuery(queryEvent)

			if slowLogExporter != nil && queryEvent.OverThreshold {
				slowLogExporter.Export(queryEvent)
			}

			if showAll || queryEvent.OverThreshold {
				printQueryWithAnalysis(queryEvent, sqlAnalyzer)
			}
		}
	}
}

func printQueryWithAnalysis(event tracker.QueryEvent, analyzer *analyzer.Analyzer) {
	timestamp := event.Timestamp.Format("15:04:05.000")
	slowMark := ""
	if event.OverThreshold {
		slowMark = " ⚠️ SLOW"
	}

	sslMark := ""
	if event.IsSSL {
		sslMark = " [TLS]"
	}

	sourceMark := fmt.Sprintf(" [%s]", event.Source)

	fmt.Printf("[%s]%s%s%s\n", timestamp, slowMark, sslMark, sourceMark)
	fmt.Printf("  Duration: %v\n", event.Duration.Round(100*time.Microsecond))
	if event.Database != "" {
		fmt.Printf("  Database: %s (%s)\n", event.DBType, event.Database)
	} else {
		fmt.Printf("  Database: %s\n", event.DBType)
	}
	if event.ClientIP != nil {
		fmt.Printf("  Client:   %s:%d\n", event.ClientIP, event.ClientPort)
	}
	if event.ServerIP != nil {
		fmt.Printf("  Server:   %s:%d\n", event.ServerIP, event.ServerPort)
	}
	fmt.Printf("  Process:  %s (PID: %d)\n", event.ProcessName, event.Pid)
	fmt.Printf("  SQL:      %s\n", truncateString(event.SQL, 200))

	if analyzer != nil && event.OverThreshold && enableIndexSuggest {
		analysis := analyzer.Analyze(event.SQL)
		if len(analysis.Suggestions) > 0 || len(analysis.Warnings) > 0 {
			fmt.Println(analysis.FormatSuggestions())
		}
	}

	fmt.Println()
}

func printStats(track *tracker.Tracker, probe *ebpf.Probe, killer *dbconnector.Killer) {
	trackStats := track.GetStats()
	probeStats := probe.GetStats()

	statsLine := fmt.Sprintf("\r📊 Stats: Total=%d Slow=%d | Kernel=%d Uprobe=%d SSL=%d | Lost=%d",
		trackStats.TotalQueries,
		trackStats.SlowQueries,
		trackStats.KernelEvents,
		trackStats.UprobeEvents,
		trackStats.SSLEvents,
		trackStats.LostEvents,
	)

	if killer != nil {
		statsLine += fmt.Sprintf(" | Killed=%d", killer.GetKilledCount())
	}

	statsLine += "    "
	fmt.Fprint(os.Stderr, statsLine)
}

func printFinalStats(track *tracker.Tracker, probe *ebpf.Probe, killer *dbconnector.Killer) {
	trackStats := track.GetStats()
	probeStats := probe.GetStats()

	fmt.Println("\n═══════════════════ Final Statistics ═══════════════════")
	fmt.Printf("Total queries:      %d\n", trackStats.TotalQueries)
	fmt.Printf("Slow queries:       %d\n", trackStats.SlowQueries)
	fmt.Printf("Kernel events:      %d\n", trackStats.KernelEvents)
	fmt.Printf("Uprobe events:      %d\n", trackStats.UprobeEvents)
	fmt.Printf("SSL events:         %d\n", trackStats.SSLEvents)
	fmt.Printf("Lost events:        %d\n", trackStats.LostEvents)
	fmt.Printf("eBPF received:      %d\n", probeStats.EventsReceived)
	fmt.Printf("eBPF parsed:        %d\n", probeStats.EventsParsed)

	if killer != nil {
		fmt.Printf("Auto-killed:        %d\n", killer.GetKilledCount())
	}

	if trackStats.TotalQueries > 0 {
		lossRate := float64(trackStats.LostEvents) / float64(trackStats.TotalQueries+trackStats.LostEvents) * 100
		fmt.Printf("Loss rate:          %.2f%%\n", lossRate)
	}

	if trackStats.SlowQueries > 0 {
		slowRate := float64(trackStats.SlowQueries) / float64(trackStats.TotalQueries) * 100
		fmt.Printf("Slow query rate:    %.2f%%\n", slowRate)
	}

	fmt.Println("═══════════════════════════════════════════════════════")
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
