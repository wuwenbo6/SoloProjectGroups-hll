package main

import (
	"flag"
	"fmt"
	"log"
	"math/rand"
	"net"
	"time"

	"bgp-evpn-simulator/internal/api"
	"bgp-evpn-simulator/internal/bgp"
	"bgp-evpn-simulator/internal/models"
	"bgp-evpn-simulator/internal/vxlan"
)

func main() {
	addr := flag.String("addr", ":8080", "HTTP server address")
	flag.Parse()

	rand.Seed(time.Now().UnixNano())

	vtepCtrl := vxlan.NewVTEPController()

	setupDemoTopology(vtepCtrl)

	server := api.NewServer(vtepCtrl)

	log.Printf("BGP EVPN Simulator starting on %s", *addr)
	log.Printf("Web UI: http://localhost%s", *addr)
	log.Printf("API Endpoints:")
	log.Printf("  GET    /api/vteps          - List all VTEPs")
	log.Printf("  POST   /api/vteps          - Create a VTEP")
	log.Printf("  GET    /api/vteps/{id}     - Get VTEP details")
	log.Printf("  GET    /api/vteps/{id}/mac-table - Get MAC table")
	log.Printf("  GET    /api/vteps/{id}/routes    - Get EVPN routes")
	log.Printf("  GET    /api/tunnels        - List all tunnels")
	log.Printf("  POST   /api/tunnels        - Establish VXLAN tunnel")
	log.Printf("  POST   /api/advertise      - Advertise MAC/IP")
	log.Printf("  POST   /api/simulate       - Start simulation")
	log.Printf("  GET    /api/topology       - Get full topology")

	if err := server.ListenAndServe(*addr); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func setupDemoTopology(vtepCtrl *vxlan.VTEPController) {
	log.Println("Setting up demo topology...")

	l2VNI := uint32(10010)
	l3VNI := uint32(50000)

	vtep1, err := vtepCtrl.CreateVTEP(
		"vtep-1",
		"VTEP 1 (Leaf 1)",
		net.ParseIP("192.168.1.1"),
		net.ParseIP("10.0.0.1"),
		l2VNI,
		l3VNI,
	)
	if err != nil {
		log.Printf("Failed to create VTEP 1: %v", err)
		return
	}
	log.Printf("Created VTEP: %s (%s) L2VNI=%d L3VNI=%d", vtep1.ID, vtep1.Name, vtep1.L2VNI, vtep1.L3VNI)

	vtep2, err := vtepCtrl.CreateVTEP(
		"vtep-2",
		"VTEP 2 (Leaf 2)",
		net.ParseIP("192.168.1.2"),
		net.ParseIP("10.0.0.2"),
		l2VNI,
		l3VNI,
	)
	if err != nil {
		log.Printf("Failed to create VTEP 2: %v", err)
		return
	}
	log.Printf("Created VTEP: %s (%s) L2VNI=%d L3VNI=%d", vtep2.ID, vtep2.Name, vtep2.L2VNI, vtep2.L3VNI)

	vtep3, err := vtepCtrl.CreateVTEP(
		"vtep-3",
		"VTEP 3 (Leaf 3)",
		net.ParseIP("192.168.1.3"),
		net.ParseIP("10.0.0.3"),
		l2VNI,
		l3VNI,
	)
	if err != nil {
		log.Printf("Failed to create VTEP 3: %v", err)
		return
	}
	log.Printf("Created VTEP: %s (%s) L2VNI=%d L3VNI=%d", vtep3.ID, vtep3.Name, vtep3.L2VNI, vtep3.L3VNI)

	log.Println("Establishing VXLAN tunnels...")

	tunnel1, err := vtepCtrl.EstablishVXLANTunnel("vtep-1", "vtep-2", l2VNI)
	if err != nil {
		log.Printf("Failed to establish tunnel 1-2: %v", err)
		return
	}
	log.Printf("Established VXLAN tunnel: %s (VNI: %d)", tunnel1.ID, tunnel1.VNI)

	tunnel2, err := vtepCtrl.EstablishVXLANTunnel("vtep-1", "vtep-3", l2VNI)
	if err != nil {
		log.Printf("Failed to establish tunnel 1-3: %v", err)
		return
	}
	log.Printf("Established VXLAN tunnel: %s (VNI: %d)", tunnel2.ID, tunnel2.VNI)

	tunnel3, err := vtepCtrl.EstablishVXLANTunnel("vtep-2", "vtep-3", l2VNI)
	if err != nil {
		log.Printf("Failed to establish tunnel 2-3: %v", err)
		return
	}
	log.Printf("Established VXLAN tunnel: %s (VNI: %d)", tunnel3.ID, tunnel3.VNI)

	for i := 0; i < 3; i++ {
		mac := bgp.GenerateRandomMAC()
		ip := bgp.GenerateRandomIP()
		vtepID := fmt.Sprintf("vtep-%d", (i%3)+1)
		route, err := vtepCtrl.AdvertiseMAC(vtepID, mac, ip, l2VNI, l3VNI)
		if err != nil {
			log.Printf("Failed to advertise MAC: %v", err)
			continue
		}
		log.Printf("Advertised Type 2 Route from %s: RD=%s MAC=%s, IP=%s, L2VNI=%d, L3VNI=%d",
			route.OriginVTEP, route.RD, route.MACAddress, route.IPAddress, route.L2VNI, route.L3VNI)
		time.Sleep(100 * time.Millisecond)
	}

	log.Println("Advertising Type 3 (Inclusive Multicast) routes...")
	for i := 0; i < 2; i++ {
		vtepID := fmt.Sprintf("vtep-%d", (i%3)+1)
		groupIP := bgp.GenerateRandomMulticastIP()
		sourceIP := bgp.GenerateRandomIP()
		route, err := vtepCtrl.AdvertiseMulticastGroup(vtepID, l2VNI, groupIP, sourceIP, models.PMSITunnelTypeIngressReplication)
		if err != nil {
			log.Printf("Failed to advertise multicast group: %v", err)
			continue
		}
		log.Printf("Advertised Type 3 Route from %s: RD=%s Group=%s, Source=%s, L2VNI=%d, Tunnel=%s",
			route.OriginVTEP, route.RD, route.MulticastGroup.GroupIP, route.MulticastGroup.SourceIP, route.L2VNI, bgp.PMSITunnelTypeName(route.PMSITunnel.TunnelType))
		time.Sleep(100 * time.Millisecond)
	}

	log.Println("Demo topology setup complete!")
	log.Println("Open http://localhost:8080 in your browser to view the simulator")
}
