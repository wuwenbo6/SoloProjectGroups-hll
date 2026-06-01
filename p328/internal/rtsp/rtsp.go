package rtsp

import (
	"bufio"
	"fmt"
	"net"
	"strconv"
	"strings"
)

type Method string

const (
	MethodOptions  Method = "OPTIONS"
	MethodDescribe Method = "DESCRIBE"
	MethodSetup    Method = "SETUP"
	MethodPlay     Method = "PLAY"
	MethodPause    Method = "PAUSE"
	MethodTeardown Method = "TEARDOWN"
	MethodAnnounce Method = "ANNOUNCE"
	MethodRecord   Method = "RECORD"
	MethodGetParam Method = "GET_PARAMETER"
	MethodSetParam Method = "SET_PARAMETER"
)

type Request struct {
	Method     Method
	URL        string
	Version    string
	Headers    map[string]string
	CSeq       int
	Session    string
	Transport  string
	Raw        string
}

type Response struct {
	Version    string
	StatusCode int
	StatusText string
	Headers    map[string]string
	Body       []byte
}

type Client struct {
	Conn        net.Conn
	Reader      *bufio.Reader
	Writer      *bufio.Writer
	SessionID   string
	ClientAddr  *net.UDPAddr
	ServerPort  int
	RTPPort     int
	RTCPPort    int
	ClientRTPPort int
	ClientRTCPPort int
	IsPlaying   bool
	IsPaused    bool
}

func NewRequest() *Request {
	return &Request{
		Headers: make(map[string]string),
	}
}

func NewResponse(statusCode int, statusText string) *Response {
	return &Response{
		Version:    "RTSP/1.0",
		StatusCode: statusCode,
		StatusText: statusText,
		Headers:    make(map[string]string),
	}
}

func ParseRequest(reader *bufio.Reader) (*Request, error) {
	req := NewRequest()
	var lines []string

	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return nil, err
		}

		line = strings.TrimRight(line, "\r\n")
		req.Raw += line + "\r\n"

		if line == "" {
			break
		}

		lines = append(lines, line)
	}

	if len(lines) == 0 {
		return nil, fmt.Errorf("empty request")
	}

	firstLine := strings.Split(lines[0], " ")
	if len(firstLine) < 3 {
		return nil, fmt.Errorf("invalid request line: %s", lines[0])
	}

	req.Method = Method(firstLine[0])
	req.URL = firstLine[1]
	req.Version = firstLine[2]

	for i := 1; i < len(lines); i++ {
		line := lines[i]
		idx := strings.Index(line, ":")
		if idx > 0 {
			key := strings.TrimSpace(line[:idx])
			value := strings.TrimSpace(line[idx+1:])
			req.Headers[key] = value

			switch strings.ToLower(key) {
			case "cseq":
				if cseq, err := strconv.Atoi(value); err == nil {
					req.CSeq = cseq
				}
			case "session":
				req.Session = value
			case "transport":
				req.Transport = value
			}
		}
	}

	return req, nil
}

func ParseTransport(transport string) (clientRTPPort, clientRTCPPort int, serverPort int, protocol string) {
	parts := strings.Split(transport, ";")
	protocol = "RTP/AVP"

	for _, part := range parts {
		part = strings.TrimSpace(part)

		if strings.HasPrefix(part, "RTP/") {
			protocol = part
			continue
		}

		if strings.HasPrefix(part, "client_port=") {
			ports := strings.Split(part[len("client_port="):], "-")
			if len(ports) >= 1 {
				if p, err := strconv.Atoi(ports[0]); err == nil {
					clientRTPPort = p
				}
			}
			if len(ports) >= 2 {
				if p, err := strconv.Atoi(ports[1]); err == nil {
					clientRTCPPort = p
				}
			}
		}

		if strings.HasPrefix(part, "server_port=") {
			ports := strings.Split(part[len("server_port="):], "-")
			if len(ports) >= 1 {
				if p, err := strconv.Atoi(ports[0]); err == nil {
					serverPort = p
				}
			}
		}
	}

	return clientRTPPort, clientRTCPPort, serverPort, protocol
}

func (r *Response) String() string {
	var b strings.Builder

	fmt.Fprintf(&b, "%s %d %s\r\n", r.Version, r.StatusCode, r.StatusText)

	for k, v := range r.Headers {
		fmt.Fprintf(&b, "%s: %s\r\n", k, v)
	}

	b.WriteString("\r\n")

	if len(r.Body) > 0 {
		b.Write(r.Body)
	}

	return b.String()
}

func (c *Client) SendResponse(resp *Response) error {
	if _, ok := resp.Headers["CSeq"]; !ok {
		resp.Headers["CSeq"] = "0"
	}
	if _, ok := resp.Headers["Server"]; !ok {
		resp.Headers["Server"] = "Go-RTSP-Server/1.0"
	}
	if c.SessionID != "" {
		if _, ok := resp.Headers["Session"]; !ok {
			resp.Headers["Session"] = c.SessionID
		}
	}

	if len(resp.Body) > 0 {
		resp.Headers["Content-Length"] = strconv.Itoa(len(resp.Body))
	}

	_, err := c.Conn.Write([]byte(resp.String()))
	return err
}

func (c *Client) ReadRequest() (*Request, error) {
	return ParseRequest(c.Reader)
}

func NewClient(conn net.Conn) *Client {
	return &Client{
		Conn:   conn,
		Reader: bufio.NewReader(conn),
		Writer: bufio.NewWriter(conn),
	}
}

func GenerateSessionID() string {
	b := make([]byte, 16)
	for i := range b {
		b[i] = byte(i * 31)
	}
	return fmt.Sprintf("%x", b)
}
