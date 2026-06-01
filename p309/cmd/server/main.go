package main

import (
	"fmt"
	"log"
	"net/http"
	"smb2-lease-server/internal/api"
	"smb2-lease-server/internal/lease"
	"smb2-lease-server/internal/smb2"
)

func main() {
	leaseManager := lease.NewLeaseManager()
	smb2Server := smb2.NewSMB2Server(leaseManager)
	apiHandler := api.NewAPIHandler(smb2Server, leaseManager)

	fs := http.FileServer(http.Dir("./web"))
	http.Handle("/", fs)

	http.HandleFunc("/ws", apiHandler.HandleWebSocket)
	http.HandleFunc("/api/leases", apiHandler.HandleGetLeases)
	http.HandleFunc("/api/clients", apiHandler.HandleGetClients)
	http.HandleFunc("/api/files", apiHandler.HandleGetFiles)
	http.HandleFunc("/api/client/connect", apiHandler.HandleConnectClient)
	http.HandleFunc("/api/client/disconnect", apiHandler.HandleDisconnectClient)
	http.HandleFunc("/api/file/open", apiHandler.HandleOpenFile)
	http.HandleFunc("/api/file/close", apiHandler.HandleCloseFile)
	http.HandleFunc("/api/file/write", apiHandler.HandleWriteFile)
	http.HandleFunc("/api/file/read", apiHandler.HandleReadFile)
	http.HandleFunc("/api/simulate", apiHandler.HandleSimulateClients)
	http.HandleFunc("/api/changelog", apiHandler.HandleGetChangeLog)
	http.HandleFunc("/api/changelog/export", apiHandler.HandleExportChangeLog)
	http.HandleFunc("/api/changelog/clear", apiHandler.HandleClearChangeLog)
	http.HandleFunc("/api/lease/ttl", apiHandler.HandleGetLeaseTTL)
	http.HandleFunc("/api/lease/ttl/set", apiHandler.HandleSetLeaseTTL)

	fmt.Println("SMB2 Lease Server starting on port 8080...")
	fmt.Println("Web interface: http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
