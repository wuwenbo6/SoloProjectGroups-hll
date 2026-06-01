package main

import (
	"log"
	"net/http"

	"nfv-mano/internal/handler"
	"nfv-mano/internal/middleware"
	"nfv-mano/internal/repository"
	"nfv-mano/internal/service"

	"github.com/gorilla/mux"
)

func main() {
	repo := repository.NewRepository("data.json")
	svc := service.NewManoService(repo)
	h := handler.NewHandler(svc)

	r := mux.NewRouter()
	r.Use(middleware.CORSMiddleware)
	r.Use(middleware.LoggingMiddleware)

	h.RegisterRoutes(r)

	log.Println("NFV MANO Server starting on :9090")
	if err := http.ListenAndServe(":9090", r); err != nil {
		log.Fatal(err)
	}
}
