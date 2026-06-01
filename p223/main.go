package main

import (
	"flag"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"pxe-boot-server/bootlog"
	"pxe-boot-server/config"
	"pxe-boot-server/dhcp"
	pxehttp "pxe-boot-server/http"
	"pxe-boot-server/tftp"
)

func main() {
	configFile := flag.String("config", "config.json", "Path to configuration file")
	genConfig := flag.Bool("gen-config", false, "Generate default configuration file and exit")
	flag.Parse()

	if *genConfig {
		if err := config.GenerateDefaultConfig(*configFile); err != nil {
			log.Fatalf("Failed to generate default config: %v", err)
		}
		log.Printf("Default configuration written to %s", *configFile)
		return
	}

	store, err := config.NewConfigStore(*configFile)
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	cfg := store.Get()

	bootLogger, err := bootlog.NewBootLogger(cfg.Log.BootLogFile)
	if err != nil {
		log.Fatalf("Failed to initialize boot logger: %v", err)
	}
	defer bootLogger.Close()

	registerOSDefaults(store)

	menuGen := func() ([]pxehttp.BootConfig, string, uint32, string) {
		entries := store.ResolveMenuEntries()
		title, timeout, defaultLabel := store.GetMenuConfig()
		return entries, title, timeout, defaultLabel
	}

	bootCallback := func(mac, osType, ip, userAgent string) {
		if err := bootLogger.Log(mac, osType, ip, userAgent); err != nil {
			log.Printf("Failed to log boot event: %v", err)
		} else {
			log.Printf("Boot logged: MAC=%s, OS=%s, IP=%s", mac, osType, ip)
		}
	}

	ipxeBootURI := cfg.DHCP.IPXEBootURI
	if cfg.Defaults.UseMenu {
		_, port, err := net.SplitHostPort(cfg.HTTP.ListenAddr)
		if err != nil {
			port = "8080"
		}
		ipxeBootURI = "http://" + cfg.DHCP.ServerIP + ":" + port + "/menu.ipxe"
	}

	dhcpServer, err := createDHCPServer(cfg, ipxeBootURI)
	if err != nil {
		log.Fatalf("Failed to create DHCP server: %v", err)
	}

	httpServer := pxehttp.NewServer(cfg.HTTP.ListenAddr, store.BootConfigGenerator(), menuGen, bootCallback)

	tftpServer := tftp.NewServer(cfg.TFTP.ListenAddr, cfg.TFTP.Directory)

	if err := os.MkdirAll(cfg.TFTP.Directory, 0755); err != nil {
		log.Fatalf("Failed to create TFTP directory: %v", err)
	}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Println("Starting TFTP server...")
		if err := tftpServer.ListenAndServe(); err != nil {
			log.Fatalf("TFTP server error: %v", err)
		}
	}()

	go func() {
		log.Println("Starting HTTP server...")
		if err := httpServer.ListenAndServe(); err != nil {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	go func() {
		log.Println("Starting DHCP server...")
		if err := dhcpServer.ListenAndServe(); err != nil {
			log.Fatalf("DHCP server error: %v", err)
		}
	}()

	log.Println("PXE Boot Server started successfully")
	log.Println("  DHCP:  ", cfg.DHCP.ListenAddr)
	log.Println("  HTTP:  ", cfg.HTTP.ListenAddr)
	log.Println("  TFTP:  ", cfg.TFTP.ListenAddr)
	log.Println("  Log:   ", cfg.Log.BootLogFile)
	log.Println("Default OS:", cfg.Defaults.OSType)
	log.Println("Menu Mode:", cfg.Defaults.UseMenu)
	if cfg.Defaults.UseMenu {
		log.Println("iPXE Menu:", ipxeBootURI)
	}
	log.Println("Press Ctrl+C to stop")

	sig := <-sigCh
	log.Printf("Received signal %v, shutting down...", sig)

	dhcpServer.Close()
	httpServer.Close()
	tftpServer.Close()

	log.Println("Server stopped")
}

func registerOSDefaults(store *config.ConfigStore) {
	cfg := store.Get()
	for osType, osDefault := range cfg.OSDefaults {
		bc := &pxehttp.BootConfig{
			Label:        osType,
			OSType:       osType,
			KernelURL:    osDefault.KernelURL,
			InitrdURL:    osDefault.InitrdURL,
			KernelParams: osDefault.KernelParams,
		}
		pxehttp.RegisterOSDefault(osType, bc)
	}
}

func createDHCPServer(cfg *config.AppConfig, ipxeBootURI string) (*dhcp.Server, error) {
	dhcpCfg := dhcp.ServerConfig{
		ListenAddr:   cfg.DHCP.ListenAddr,
		ServerIP:     net.ParseIP(cfg.DHCP.ServerIP),
		SubnetMask:   net.ParseIP(cfg.DHCP.SubnetMask),
		Gateway:      net.ParseIP(cfg.DHCP.Gateway),
		LeaseTime:    cfg.DHCP.LeaseTime,
		TFTPServer:   cfg.DHCP.TFTPServer,
		BootFile:     cfg.DHCP.BootFile,
		BootFileBIOS: cfg.DHCP.BootFileBIOS,
		BootFileEFI:  cfg.DHCP.BootFileEFI,
		IPXEBootFile: ipxeBootURI,
		LeaseStart:   cfg.DHCP.LeaseStart,
		LeaseEnd:     cfg.DHCP.LeaseEnd,
	}

	for _, dns := range cfg.DHCP.DNSServers {
		if ip := net.ParseIP(dns); ip != nil {
			dhcpCfg.DNSServers = append(dhcpCfg.DNSServers, ip)
		}
	}

	return dhcp.NewServer(dhcpCfg)
}
