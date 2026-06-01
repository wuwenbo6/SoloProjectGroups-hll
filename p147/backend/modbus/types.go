package modbus

type SerialConfig struct {
	Port     string `json:"port"`
	BaudRate int    `json:"baudRate"`
	DataBits int    `json:"dataBits"`
	Parity   string `json:"parity"`
	StopBits int    `json:"stopBits"`
}

type BackupRoute struct {
	Enabled     bool       `json:"enabled"`
	SerialPort  string     `json:"serialPort"`
	BaudRate    int        `json:"baudRate"`
	DataBits    int        `json:"dataBits"`
	Parity      string     `json:"parity"`
	StopBits    int        `json:"stopBits"`
	SlaveID     byte       `json:"slaveId"`
	AutoFailback bool      `json:"autoFailback"`
	FailbackInterval int  `json:"failbackInterval"`
}

type Route struct {
	ID          int         `json:"id"`
	IPAddress   string      `json:"ipAddress"`
	SerialPort  string      `json:"serialPort"`
	BaudRate    int         `json:"baudRate"`
	DataBits    int         `json:"dataBits"`
	Parity      string      `json:"parity"`
	StopBits    int         `json:"stopBits"`
	SlaveID     byte        `json:"slaveId"`
	Enabled     bool        `json:"enabled"`
	Backup      BackupRoute `json:"backup"`
	ActivePath  string      `json:"activePath"`
}

type UnitTimeoutStats struct {
	UnitID       byte  `json:"unitId"`
	TimeoutCount int64 `json:"timeoutCount"`
	TotalCount   int64 `json:"totalCount"`
	LastTimeout  string `json:"lastTimeout"`
}

type Stats struct {
	RouteID        int              `json:"routeId"`
	PacketsSent    int64            `json:"packetsSent"`
	PacketsReceived int64           `json:"packetsReceived"`
	BytesSent      int64            `json:"bytesSent"`
	BytesReceived  int64            `json:"bytesReceived"`
	Errors         int64            `json:"errors"`
	LastActivity   string           `json:"lastActivity"`
	UnitTimeouts   []UnitTimeoutStats `json:"unitTimeouts"`
}

type TestRequest struct {
	RouteID      int    `json:"routeId"`
	FunctionCode byte   `json:"functionCode"`
	Address      uint16 `json:"address"`
	Quantity     uint16 `json:"quantity"`
	Value        uint16 `json:"value"`
}

type TestResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

