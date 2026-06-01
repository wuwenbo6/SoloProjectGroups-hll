package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"radius-coa-server/internal/api"
	coaserver "radius-coa-server/internal/coa"
	radiusserver "radius-coa-server/internal/radius"
	"radius-coa-server/internal/session"
)

const (
	radiusSecret = "testing123"
	authAddr     = ":1812"
	acctAddr     = ":1813"
	coaAddr      = ":3799"
	httpAddr     = ":8080"
)

func main() {
	log.Println("Starting RADIUS CoA Server...")

	sessionMgr := session.NewManager()

	radiusAuthSrv := radiusserver.NewServer(radiusSecret, authAddr, sessionMgr, "auth")
	radiusAcctSrv := radiusserver.NewServer(radiusSecret, acctAddr, sessionMgr, "acct")
	coaSrv := coaserver.NewServer(radiusSecret, coaAddr, sessionMgr)
	apiSrv := api.NewServer(httpAddr, sessionMgr, coaSrv)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	errChan := make(chan error, 4)

	go func() {
		if err := radiusAuthSrv.Start(ctx); err != nil {
			errChan <- err
		}
	}()

	go func() {
		if err := radiusAcctSrv.Start(ctx); err != nil {
			errChan <- err
		}
	}()

	go func() {
		if err := coaSrv.Start(ctx); err != nil {
			errChan <- err
		}
	}()

	go func() {
		if err := apiSrv.Start(ctx); err != nil {
			errChan <- err
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	log.Println("RADIUS CoA Server started successfully")
	log.Printf("  Auth UDP: %s", authAddr)
	log.Printf("  Acct UDP: %s", acctAddr)
	log.Printf("  CoA  UDP: %s", coaAddr)
	log.Printf("  HTTP API: %s", httpAddr)
	log.Println("Press Ctrl+C to stop")

	select {
	case err := <-errChan:
		log.Printf("Server error: %v", err)
	case sig := <-sigChan:
		log.Printf("Received signal: %v", sig)
	}

	log.Println("Shutting down servers...")
	cancel()

	shutdownCtx := context.Background()
	_ = radiusAuthSrv.Shutdown(shutdownCtx)
	_ = radiusAcctSrv.Shutdown(shutdownCtx)
	_ = coaSrv.Shutdown(shutdownCtx)
	_ = apiSrv.Shutdown(shutdownCtx)

	log.Println("RADIUS CoA Server stopped")
}
