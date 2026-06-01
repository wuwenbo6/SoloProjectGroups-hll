package model

type ConnectRequest struct {
	Address string `json:"address"`
	TLS     bool   `json:"tls"`
}

type ConnectResponse struct {
	Services []string `json:"services"`
}

type ServicesRequest struct {
	Address string `json:"address"`
	TLS     bool   `json:"tls"`
	Service string `json:"service"`
}

type MethodInfo struct {
	Name       string                 `json:"name"`
	FullMethod string                 `json:"fullMethod"`
	InputType  string                 `json:"inputType"`
	OutputType string                 `json:"outputType"`
	InputSchema map[string]interface{} `json:"inputSchema"`
	OutputSchema map[string]interface{} `json:"outputSchema"`
	IsServerStreaming bool `json:"isServerStreaming"`
	IsClientStreaming bool `json:"isClientStreaming"`
}

type ServicesResponse struct {
	Service string       `json:"service"`
	Methods []MethodInfo `json:"methods"`
}

type InvokeRequest struct {
	Address    string `json:"address"`
	TLS        bool   `json:"tls"`
	Method     string `json:"method"`
	RequestJson string `json:"requestJson"`
	Timeout    int    `json:"timeout"`
}

type InvokeResponse struct {
	Response string `json:"response,omitempty"`
	Error    string `json:"error,omitempty"`
	Status   string `json:"status"`
	Duration string `json:"duration"`
}
