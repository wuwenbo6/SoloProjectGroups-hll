package main

import (
	"flag"
	"mtp2-simulator/backend/pkg/mtp2"
)

func main() {
	port := flag.String("port", "8080", "Server port")
	flag.Parse()

	server := mtp2.NewWebSocketServer()
	server.Start(*port)
}
