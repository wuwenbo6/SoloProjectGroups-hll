package main

import (
	"fmt"
	"log"
	"mlag-simulator/api"
	"mlag-simulator/mlag"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"
)

func main() {
	fmt.Println("========================================")
	fmt.Println("    MLAG 交换机模拟器")
	fmt.Println("    Multi-Chassis Link Aggregation")
	fmt.Println("========================================")
	fmt.Println()

	config1 := mlag.MlagConfig{
		DomainID:          "mlag-001",
		PeerAddress:       "127.0.0.1:8080",
		LocalAddress:      "127.0.0.1:8080",
		HeartbeatInterval: 1 * time.Second,
		DeadInterval:      5 * time.Second,
		Priority:          100,
		FailbackTimer:     3 * time.Minute,
		MacDriftWindow:    30 * time.Second,
		MacDriftThreshold: 5,
	}

	config2 := mlag.MlagConfig{
		DomainID:          "mlag-001",
		PeerAddress:       "127.0.0.1:8080",
		LocalAddress:      "127.0.0.1:8080",
		HeartbeatInterval: 1 * time.Second,
		DeadInterval:      5 * time.Second,
		Priority:          90,
		FailbackTimer:     3 * time.Minute,
		MacDriftWindow:    30 * time.Second,
		MacDriftThreshold: 5,
	}

	sw1 := mlag.NewSwitch("sw-001", "Switch-A", config1)
	sw2 := mlag.NewSwitch("sw-002", "Switch-B", config2)

	mlag.SetupMlagPair(sw1, sw2)

	var wg sync.WaitGroup

	if err := sw1.Start(&wg); err != nil {
		log.Fatalf("Failed to start switch 1: %v", err)
	}
	if err := sw2.Start(&wg); err != nil {
		log.Fatalf("Failed to start switch 2: %v", err)
	}

	fmt.Println("[OK] Switch-A (sw-001) 已启动, 优先级: 100")
	fmt.Println("[OK] Switch-B (sw-002) 已启动, 优先级: 90")
	fmt.Println("[OK] 回切定时器: 3m0s")
	fmt.Println("[OK] MAC防漂移窗口: 30s, 阈值: 5次")
	fmt.Println()

	server := api.NewServer(sw1, sw2)
	handler := server.SetupRoutes()

	go func() {
		fmt.Println("[OK] HTTP 服务启动于 :8080")
		fmt.Println("     访问 http://localhost:8080 查看状态")
		fmt.Println()
		if err := http.ListenAndServe(":8080", handler); err != nil {
			log.Fatalf("HTTP server failed: %v", err)
		}
	}()

	go printStatusLoop(sw1, sw2)

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	fmt.Println()
	fmt.Println("正在关闭...")

	sw1.Stop()
	sw2.Stop()
	wg.Wait()

	fmt.Println("系统已关闭")
}

func printStatusLoop(sw1, sw2 *mlag.Switch) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		status1 := sw1.GetStatus()
		status2 := sw2.GetStatus()

		fb1 := ""
		if status1.Failback.State == "waiting" {
			fb1 = fmt.Sprintf(" [回切: %s]", status1.Failback.Remaining)
		}
		fb2 := ""
		if status2.Failback.State == "waiting" {
			fb2 = fmt.Sprintf(" [回切: %s]", status2.Failback.Remaining)
		}

		fmt.Printf("\r[状态] Switch-A: %-6s%s | Switch-B: %-6s%s | MAC漂移: %d/%d | MAC阻断: %d/%d",
			status1.Role, fb1, status2.Role, fb2,
			status1.MacDriftCount, status2.MacDriftCount,
			status1.MacBlockedCount, status2.MacBlockedCount)
	}
}
