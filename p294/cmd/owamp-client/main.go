package main

import (
	"flag"
	"fmt"
	"log"

	"github.com/owamp-client/pkg/api"
)

func main() {
	httpAddr := flag.String("http", ":8080", "HTTP server address")
	flag.Parse()

	fmt.Println("========================================")
	fmt.Println("OWAMP Client - One-Way Active Measurement Protocol")
	fmt.Println("========================================")
	fmt.Printf("Starting HTTP server on %s\n", *httpAddr)
	fmt.Println("Open http://localhost" + *httpAddr + " in your browser")
	fmt.Println("========================================")

	server := api.NewServer(*httpAddr)
	if err := server.Start(); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
