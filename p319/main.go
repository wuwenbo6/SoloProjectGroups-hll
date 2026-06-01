package main

import (
	"rdma-sim/api"
	"rdma-sim/rdma"
)

func main() {
	sim := rdma.NewSimulator()
	server := api.NewServer(sim, 8080)
	if err := server.Start(); err != nil {
		panic(err)
	}
}
