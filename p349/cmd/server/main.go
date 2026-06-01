package main

import (
	"fmt"
	"log"
	"net/http"

	"sriov-simulator/pkg/api"
	"sriov-simulator/pkg/sriov"
)

func main() {
	manager := sriov.NewManager()

	manager.AddPF("pf0", "Intel Ethernet Controller XL710", "0000:01:00.0", 8)
	manager.AddPF("pf1", "Mellanox ConnectX-5", "0000:02:00.0", 16)

	manager.AddVM("vm1", "web-server")
	manager.AddVM("vm2", "database-server")
	manager.AddVM("vm3", "app-server")

	_, err := manager.CreateMultipleVFs("pf0", 4)
	if err != nil {
		log.Printf("Warning: failed to create VFs for pf0: %v", err)
	}

	_, err = manager.CreateMultipleVFs("pf1", 6)
	if err != nil {
		log.Printf("Warning: failed to create VFs for pf1: %v", err)
	}

	_, err = manager.AssignVF("pf0", "pf0-vf0", "vm1", "0000:03:00.0")
	if err != nil {
		log.Printf("Warning: failed to assign VF to vm1: %v", err)
	}

	_, err = manager.AssignVF("pf1", "pf1-vf1", "vm2", "0000:03:00.1")
	if err != nil {
		log.Printf("Warning: failed to assign VF to vm2: %v", err)
	}

	handler := api.NewHandler(manager)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	port := ":8080"
	fmt.Printf("SR-IOV Simulator server starting on http://localhost%s\n", port)
	fmt.Println("API Endpoints:")
	fmt.Println("  GET  /api/stats          - Get system statistics")
	fmt.Println("  GET  /api/pfs            - List all PFs")
	fmt.Println("  POST /api/pfs            - Create a new PF")
	fmt.Println("  GET  /api/pfs/{id}       - Get a specific PF")
	fmt.Println("  GET  /api/pfs/{id}/vfs   - List VFs for a PF")
	fmt.Println("  POST /api/pfs/{id}/vfs   - Create VFs (count in body)")
	fmt.Println("  GET  /api/vms            - List all VMs")
	fmt.Println("  POST /api/vms            - Create a new VM")
	fmt.Println("  POST /api/assign         - Assign a VF to a VM")
	fmt.Println("  POST /api/release        - Release a VF from a VM")
	fmt.Println("  POST /api/migrate        - Migrate a VF to another PF (host)")
	fmt.Println("  POST /api/vfs/qos        - Set VF QoS (bandwidth limits)")
	fmt.Println("  GET  /api/logs           - Get VF operation logs")
	fmt.Println("  GET  /api/logs/export/json - Export logs as JSON")
	fmt.Println("  GET  /api/logs/export/csv  - Export logs as CSV")

	log.Fatal(http.ListenAndServe(port, mux))
}
