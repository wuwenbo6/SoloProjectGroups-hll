package main

import (
	"flag"
	"fmt"
	"log"
	"math/rand"
	"os"
	"os/signal"
	"syscall"
	"time"

	"rtsp-server/internal/rtsp"
)

func main() {
	rand.Seed(time.Now().UnixNano())

	var (
		addr      = flag.String("addr", ":8554", "RTSP server listen address")
		videoFile = flag.String("file", "video.mp4", "H.264 MP4 video file path")
	)

	flag.Parse()

	if _, err := os.Stat(*videoFile); os.IsNotExist(err) {
		fmt.Printf("Error: Video file '%s' not found\n", *videoFile)
		fmt.Println("\nUsage:")
		flag.PrintDefaults()
		fmt.Println("\nExample:")
		fmt.Printf("  %s -file /path/to/video.mp4\n", os.Args[0])
		fmt.Printf("  %s -addr :8554 -file video.mp4\n", os.Args[0])
		fmt.Println("\nThen open VLC and play: rtsp://localhost:8554/live")
		os.Exit(1)
	}

	server, err := rtsp.NewServer(*addr, *videoFile)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if err := server.Start(); err != nil {
			log.Printf("Server error: %v", err)
		}
	}()

	<-sigChan
	log.Println("Shutting down server...")
	server.Stop()
	log.Println("Server stopped")
}
