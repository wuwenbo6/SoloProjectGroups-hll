package model

type ServiceType string

const (
	ServiceTypePrinter    ServiceType = "printer"
	ServiceTypeAirPlay    ServiceType = "airplay"
	ServiceTypeHomeKit    ServiceType = "homekit"
	ServiceTypeHTTP       ServiceType = "http"
	ServiceTypeChromecast ServiceType = "chromecast"
	ServiceTypeNFS        ServiceType = "nfs"
	ServiceTypeSMB        ServiceType = "smb"
	ServiceTypeOther      ServiceType = "other"
)

type ServiceStatus string

const (
	StatusOnline  ServiceStatus = "online"
	StatusOffline ServiceStatus = "offline"
)

type Subnet struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	CIDR         string `json:"cidr"`
	Color        string `json:"color"`
	Interface    string `json:"interface"`
	ServiceCount int    `json:"serviceCount"`
	LastSeen     string `json:"lastSeen"`
}

type MDnsService struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Type         ServiceType       `json:"type"`
	Subtype      string            `json:"subtype"`
	IP           string            `json:"ip"`
	Port         int               `json:"port"`
	TXTRecords   map[string]string `json:"txtRecords"`
	Status       ServiceStatus     `json:"status"`
	DiscoveredAt string            `json:"discoveredAt"`
	SubnetID     string            `json:"subnetId"`
	TTL          uint32            `json:"ttl"`
	TTLRemaining int64             `json:"ttlRemaining"`
	Authorized   bool              `json:"authorized"`
}

type AuthPolicy struct {
	AllowedTypes      []ServiceType `json:"allowedTypes"`
	AllowUnauthorized bool          `json:"allowUnauthorized"`
}

func DefaultAuthPolicy() *AuthPolicy {
	return &AuthPolicy{
		AllowedTypes: []ServiceType{
			ServiceTypePrinter,
			ServiceTypeAirPlay,
			ServiceTypeHomeKit,
		},
		AllowUnauthorized: false,
	}
}

func (p *AuthPolicy) IsAllowed(svcType ServiceType) bool {
	if p.AllowUnauthorized {
		return true
	}
	for _, t := range p.AllowedTypes {
		if t == svcType {
			return true
		}
	}
	return false
}

type SRVRecord struct {
	Target   string `json:"target"`
	Port     int    `json:"port"`
	Priority int    `json:"priority"`
	Weight   int    `json:"weight"`
}

type ServiceRecords struct {
	PTR string            `json:"ptr"`
	SRV SRVRecord         `json:"srv"`
	TXT map[string]string `json:"txt"`
}

type ReflectorStatus struct {
	Status           string   `json:"status"`
	Uptime           int64    `json:"uptime"`
	PacketsForwarded int64    `json:"packetsForwarded"`
	ActiveInterfaces []string `json:"activeInterfaces"`
	StartedAt        string   `json:"startedAt"`
}

type EventType string

const (
	EventServiceDiscovered EventType = "service_discovered"
	EventServiceLost       EventType = "service_lost"
	EventReflectorStats    EventType = "reflector_stats"
	EventTTLExpired        EventType = "ttl_expired"
)

type WSEvent struct {
	Type             EventType    `json:"type"`
	Service          *MDnsService `json:"service,omitempty"`
	ServiceID        string       `json:"serviceId,omitempty"`
	SubnetID         string       `json:"subnetId,omitempty"`
	PacketsForwarded int64        `json:"packetsForwarded,omitempty"`
	Uptime           int64        `json:"uptime,omitempty"`
}
