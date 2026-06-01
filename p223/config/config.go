package config

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"strings"
	"sync"

	pxehttp "pxe-boot-server/http"
)

type MACMapping struct {
	OSType       string `json:"os_type"`
	KernelURL    string `json:"kernel_url"`
	InitrdURL    string `json:"initrd_url"`
	KernelParams string `json:"kernel_params,omitempty"`
}

type OSDefault struct {
	KernelURL    string `json:"kernel_url"`
	InitrdURL    string `json:"initrd_url"`
	KernelParams string `json:"kernel_params,omitempty"`
}

type MenuEntry struct {
	Label        string `json:"label"`
	OSType       string `json:"os_type"`
	KernelURL    string `json:"kernel_url,omitempty"`
	InitrdURL    string `json:"initrd_url,omitempty"`
	KernelParams string `json:"kernel_params,omitempty"`
	Default      bool   `json:"default,omitempty"`
}

type AppConfig struct {
	DHCP struct {
		ListenAddr   string   `json:"listen_addr"`
		ServerIP     string   `json:"server_ip"`
		SubnetMask   string   `json:"subnet_mask"`
		Gateway      string   `json:"gateway"`
		DNSServers   []string `json:"dns_servers"`
		LeaseTime    uint32   `json:"lease_time"`
		TFTPServer   string   `json:"tftp_server"`
		BootFile     string   `json:"boot_file"`
		BootFileBIOS string   `json:"boot_file_bios"`
		BootFileEFI  string   `json:"boot_file_efi"`
		IPXEBootURI  string   `json:"ipxe_boot_uri"`
		LeaseStart   string   `json:"lease_start"`
		LeaseEnd     string   `json:"lease_end"`
	} `json:"dhcp"`

	HTTP struct {
		ListenAddr string `json:"listen_addr"`
	} `json:"http"`

	TFTP struct {
		ListenAddr string `json:"listen_addr"`
		Directory  string `json:"directory"`
	} `json:"tftp"`

	Defaults struct {
		OSType    string `json:"os_type"`
		UseMenu   bool   `json:"use_menu"`
		MenuTitle string `json:"menu_title"`
		MenuTimeout uint32 `json:"menu_timeout"`
	} `json:"defaults"`

	OSDefaults map[string]OSDefault `json:"os_defaults"`

	Menu []MenuEntry `json:"menu"`

	MACMappings map[string]MACMapping `json:"mac_mappings"`

	Log struct {
		BootLogFile string `json:"boot_log_file"`
	} `json:"log"`
}

type ConfigStore struct {
	mu       sync.RWMutex
	config   *AppConfig
	filePath string
}

func NewConfigStore(filePath string) (*ConfigStore, error) {
	store := &ConfigStore{
		filePath: filePath,
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			store.config = defaultConfig()
			return store, nil
		}
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var cfg AppConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	store.config = &cfg
	return store, nil
}

func (s *ConfigStore) Get() *AppConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config
}

func (s *ConfigStore) Reload() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return fmt.Errorf("failed to read config file: %w", err)
	}

	var cfg AppConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return fmt.Errorf("failed to parse config file: %w", err)
	}

	s.config = &cfg
	return nil
}

func (s *ConfigStore) AddMACMapping(mac string, mapping MACMapping) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	parsedMAC, err := net.ParseMAC(mac)
	if err != nil {
		return fmt.Errorf("invalid MAC address: %s", err)
	}

	if s.config.MACMappings == nil {
		s.config.MACMappings = make(map[string]MACMapping)
	}

	s.config.MACMappings[parsedMAC.String()] = mapping
	return s.Save()
}

func (s *ConfigStore) RemoveMACMapping(mac string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	parsedMAC, err := net.ParseMAC(mac)
	if err != nil {
		return fmt.Errorf("invalid MAC address: %s", err)
	}

	delete(s.config.MACMappings, parsedMAC.String())
	return s.Save()
}

func (s *ConfigStore) Save() error {
	data, err := json.MarshalIndent(s.config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	return os.WriteFile(s.filePath, data, 0644)
}

func (s *ConfigStore) BootConfigGenerator() pxehttp.BootScriptGenerator {
	return func(mac string) *pxehttp.BootConfig {
		s.mu.RLock()
		defer s.mu.RUnlock()

		normalizedMAC := normalizeMAC(mac)

		if mapping, ok := s.config.MACMappings[normalizedMAC]; ok {
			return &pxehttp.BootConfig{
				Label:        mapping.OSType,
				OSType:       mapping.OSType,
				KernelURL:    mapping.KernelURL,
				InitrdURL:    mapping.InitrdURL,
				KernelParams: mapping.KernelParams,
			}
		}

		defaultOS := s.config.Defaults.OSType
		if defaultOS == "" {
			defaultOS = "ubuntu"
		}

		if osDefault, ok := s.config.OSDefaults[defaultOS]; ok {
			return &pxehttp.BootConfig{
				Label:        defaultOS,
				OSType:       defaultOS,
				KernelURL:    osDefault.KernelURL,
				InitrdURL:    osDefault.InitrdURL,
				KernelParams: osDefault.KernelParams,
			}
		}

		return nil
	}
}

func (s *ConfigStore) ResolveMenuEntries() []pxehttp.BootConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []pxehttp.BootConfig

	if len(s.config.Menu) == 0 {
		for osType, osDefault := range s.config.OSDefaults {
			result = append(result, pxehttp.BootConfig{
				Label:        osType,
				OSType:       osType,
				KernelURL:    osDefault.KernelURL,
				InitrdURL:    osDefault.InitrdURL,
				KernelParams: osDefault.KernelParams,
			})
		}
		return result
	}

	for _, entry := range s.config.Menu {
		bc := pxehttp.BootConfig{
			Label:        entry.Label,
			OSType:       entry.OSType,
			KernelURL:    entry.KernelURL,
			InitrdURL:    entry.InitrdURL,
			KernelParams: entry.KernelParams,
		}

		if bc.KernelURL == "" || bc.InitrdURL == "" {
			if osDefault, ok := s.config.OSDefaults[entry.OSType]; ok {
				if bc.KernelURL == "" {
					bc.KernelURL = osDefault.KernelURL
				}
				if bc.InitrdURL == "" {
					bc.InitrdURL = osDefault.InitrdURL
				}
				if bc.KernelParams == "" {
					bc.KernelParams = osDefault.KernelParams
				}
			}
		}

		result = append(result, bc)
	}

	return result
}

func (s *ConfigStore) GetMenuConfig() (title string, timeout uint32, defaultLabel string) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	title = s.config.Defaults.MenuTitle
	if title == "" {
		title = "PXE Boot Menu"
	}

	timeout = s.config.Defaults.MenuTimeout
	if timeout == 0 {
		timeout = 30
	}

	for _, entry := range s.config.Menu {
		if entry.Default {
			defaultLabel = entry.Label
			break
		}
	}

	return title, timeout, defaultLabel
}

func (s *ConfigStore) UseMenu() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config.Defaults.UseMenu
}

func normalizeMAC(mac string) string {
	parsed, err := net.ParseMAC(mac)
	if err != nil {
		return strings.ToLower(mac)
	}
	return parsed.String()
}

func defaultConfig() *AppConfig {
	cfg := &AppConfig{}

	cfg.DHCP.ListenAddr = "0.0.0.0:67"
	cfg.DHCP.ServerIP = "192.168.1.1"
	cfg.DHCP.SubnetMask = "255.255.255.0"
	cfg.DHCP.Gateway = "192.168.1.1"
	cfg.DHCP.DNSServers = []string{"8.8.8.8", "8.8.4.4"}
	cfg.DHCP.LeaseTime = 86400
	cfg.DHCP.TFTPServer = "192.168.1.1"
	cfg.DHCP.BootFile = "undionly.kpxe"
	cfg.DHCP.BootFileBIOS = "undionly.kpxe"
	cfg.DHCP.BootFileEFI = "ipxe.efi"
	cfg.DHCP.IPXEBootURI = "http://192.168.1.1:8080/boot.ipxe"
	cfg.DHCP.LeaseStart = "192.168.1.100"
	cfg.DHCP.LeaseEnd = "192.168.1.200"

	cfg.HTTP.ListenAddr = "0.0.0.0:8080"

	cfg.TFTP.ListenAddr = "0.0.0.0:69"
	cfg.TFTP.Directory = "./tftproot"

	cfg.Defaults.OSType = "ubuntu"
	cfg.Defaults.UseMenu = false
	cfg.Defaults.MenuTitle = "PXE Boot Menu"
	cfg.Defaults.MenuTimeout = 30

	cfg.OSDefaults = map[string]OSDefault{
		"ubuntu": {
			KernelURL:    "http://192.168.1.1:8080/images/ubuntu/vmlinuz",
			InitrdURL:    "http://192.168.1.1:8080/images/ubuntu/initrd",
			KernelParams: "auto=true priority=critical url=http://192.168.1.1:8080/preseed/ubuntu.preseed",
		},
		"centos": {
			KernelURL:    "http://192.168.1.1:8080/images/centos/vmlinuz",
			InitrdURL:    "http://192.168.1.1:8080/images/centos/initrd.img",
			KernelParams: "text ks=http://192.168.1.1:8080/kickstart/centos.ks",
		},
	}

	cfg.Menu = []MenuEntry{
		{
			Label:   "Ubuntu 24.04 LTS",
			OSType:  "ubuntu",
			Default: true,
		},
		{
			Label:  "CentOS Stream 9",
			OSType: "centos",
		},
	}

	cfg.MACMappings = map[string]MACMapping{}

	cfg.Log.BootLogFile = "./logs/bootlog.json"

	return cfg
}

func GenerateDefaultConfig(filePath string) error {
	cfg := defaultConfig()
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal default config: %w", err)
	}
	return os.WriteFile(filePath, data, 0644)
}
