package main

import (
	"fmt"
	"log"
	"os"
)

func main() {
	rootDir := "tftp_root"
	if err := os.MkdirAll(rootDir, 0755); err != nil {
		log.Fatalf("Failed to create root directory: %v", err)
	}

	server, err := NewServer(rootDir)
	if err != nil {
		log.Fatalf("Failed to create TFTP server: %v", err)
	}

	globalServer = server

	go func() {
		if err := server.ListenAndServe(); err != nil {
			log.Fatalf("TFTP server error: %v", err)
		}
	}()

	fmt.Println("========================================")
	fmt.Println("  TFTP Server (RFC 2347/2349)")
	fmt.Println("========================================")
	fmt.Println("  TFTP UDP Port: 69")
	fmt.Println("  HTTP Web UI:    http://localhost:8080")
	fmt.Println("  Block size:     512 - 1420 bytes")
	fmt.Println("  Options:        blksize, tsize")
	fmt.Println("  MTU-based:      1500 - 20 - 8 - 4 - 48 = 1420")
	fmt.Println("========================================")

	StartHTTPServer()
}
