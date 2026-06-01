package main

import (
	"log"
	"net/http"
	"time"

	"ib-subnet-manager/api"
	"ib-subnet-manager/model"
	"ib-subnet-manager/sm"

	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
)

func main() {
	subnetManager := sm.NewSubnetManager()

	setupDemoTopology(subnetManager)

	apiHandler := api.NewAPIHandler(subnetManager)
	r := mux.NewRouter()
	apiHandler.SetupRoutes(r)

	fs := http.FileServer(http.Dir("../frontend"))
	r.PathPrefix("/").Handler(fs)

	corsHandler := handlers.CORS(
		handlers.AllowedOrigins([]string{"*"}),
		handlers.AllowedMethods([]string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}),
		handlers.AllowedHeaders([]string{"Content-Type", "Authorization"}),
	)(r)

	smpSessionMgr := apiHandler.GetSMPSessionManager()
	smpSessionMgr.Start()

	go func() {
		ticker := time.NewTicker(1 * time.Second)
		for range ticker.C {
			subnetManager.SimulateTraffic()
			subnetManager.UpdateCongestionStats()
		}
	}()

	log.Println("IB Subnet Manager starting on :8080")
	log.Println("Demo topology created with 2 switches and 4 HCAs")
	log.Println("SMP Session Manager started - link training and LFT distribution running")
	log.Println("Visit http://localhost:8080 to view the dashboard")

	if err := http.ListenAndServe(":8080", corsHandler); err != nil {
		log.Fatal("Server failed to start:", err)
	}
}

func setupDemoTopology(sm *sm.SubnetManager) {
	sw1 := &model.Node{
		GUID:            0x0001020304050601,
		NodeType:        model.NodeTypeSwitch,
		Name:            "Switch-1",
		NumPorts:        36,
		SystemImageGUID: 0x0001020304050601,
		VendorID:        0x02C9,
		DeviceID:        0x1013,
	}
	sm.AddNode(sw1)

	sw2 := &model.Node{
		GUID:            0x0001020304050602,
		NodeType:        model.NodeTypeSwitch,
		Name:            "Switch-2",
		NumPorts:        36,
		SystemImageGUID: 0x0001020304050602,
		VendorID:        0x02C9,
		DeviceID:        0x1013,
	}
	sm.AddNode(sw2)

	hca1 := &model.Node{
		GUID:            0x0011223344556601,
		NodeType:        model.NodeTypeHCA,
		Name:            "HCA-1 (Server-A)",
		NumPorts:        2,
		SystemImageGUID: 0x0011223344556600,
		VendorID:        0x02C9,
		DeviceID:        0x1017,
	}
	sm.AddNode(hca1)

	hca2 := &model.Node{
		GUID:            0x0011223344556602,
		NodeType:        model.NodeTypeHCA,
		Name:            "HCA-2 (Server-B)",
		NumPorts:        2,
		SystemImageGUID: 0x0011223344556600,
		VendorID:        0x02C9,
		DeviceID:        0x1017,
	}
	sm.AddNode(hca2)

	hca3 := &model.Node{
		GUID:            0x0011223344556603,
		NodeType:        model.NodeTypeHCA,
		Name:            "HCA-3 (Storage-1)",
		NumPorts:        2,
		SystemImageGUID: 0x0011223344556603,
		VendorID:        0x02C9,
		DeviceID:        0x1017,
	}
	sm.AddNode(hca3)

	hca4 := &model.Node{
		GUID:            0x0011223344556604,
		NodeType:        model.NodeTypeHCA,
		Name:            "HCA-4 (Storage-2)",
		NumPorts:        2,
		SystemImageGUID: 0x0011223344556604,
		VendorID:        0x02C9,
		DeviceID:        0x1017,
	}
	sm.AddNode(hca4)

	sm.ConnectNodes(0x0001020304050601, 1, 0x0001020304050602, 1)
	sm.ConnectNodes(0x0001020304050601, 2, 0x0011223344556601, 1)
	sm.ConnectNodes(0x0001020304050601, 3, 0x0011223344556602, 1)
	sm.ConnectNodes(0x0001020304050602, 2, 0x0011223344556603, 1)
	sm.ConnectNodes(0x0001020304050602, 3, 0x0011223344556604, 1)

	sm.ComputeRoutes()
}
