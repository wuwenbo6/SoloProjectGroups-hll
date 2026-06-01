package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"vsan-storage-simulator/pkg/api"
	"vsan-storage-simulator/pkg/zone"
)

var (
	addr      = flag.String("addr", ":8080", "HTTP服务地址")
	webDir    = flag.String("web", "./web", "静态文件目录")
	useSample = flag.Bool("sample", true, "是否加载示例数据")
)

func main() {
	flag.Parse()

	manager := zone.NewManager()

	if *useSample {
		manager.InitSampleData()
		log.Println("已加载示例数据")
	}

	handler := api.NewHandler(manager)

	mux := http.NewServeMux()

	mux.Handle("/api/", handler)

	absWebDir, err := filepath.Abs(*webDir)
	if err != nil {
		log.Fatalf("无法获取静态文件目录绝对路径: %v", err)
	}

	if _, err := os.Stat(absWebDir); os.IsNotExist(err) {
		log.Printf("警告: 静态文件目录不存在: %s", absWebDir)
	} else {
		fs := http.FileServer(http.Dir(absWebDir))
		mux.Handle("/", fs)
		log.Printf("静态文件目录: %s", absWebDir)
	}

	log.Printf("VSAN 存储模拟器启动在 http://localhost%s", *addr)
	log.Printf("按 Ctrl+C 停止服务")

	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatalf("启动服务器失败: %v", err)
	}
}
