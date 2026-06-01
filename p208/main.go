package main

import (
	"log"
	"net/http"
	"s1ap-simulator/handler"
)

func main() {
	wsHandler := handler.NewWebSocketHandler()

	http.HandleFunc("/", handler.ServeHome)
	http.HandleFunc("/ws", wsHandler.HandleWebSocket)
	http.HandleFunc("/api/start", wsHandler.StartSignaling)
	http.HandleFunc("/api/reset", wsHandler.ResetSignaling)

	fs := http.FileServer(http.Dir("./web"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	log.Println("S1AP Simulator starting on :8081")
	log.Println("Web interface: http://localhost:8081")
	log.Println("WebSocket: ws://localhost:8081/ws")
	log.Println("API Start: POST http://localhost:8081/api/start")
	log.Println("API Reset: POST http://localhost:8081/api/reset")

	err := http.ListenAndServe(":8081", nil)
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
