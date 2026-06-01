package sip

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"sip-analyzer/database"
)

type SIPMessage struct {
	Method        string
	StatusCode    int
	StatusText    string
	CallID        string
	From          string
	FromUser      string
	FromHost      string
	To            string
	ToUser        string
	ToHost        string
	Via           string
	Contact       string
	CSeq          string
	CSeqNum       int
	CSeqMethod    string
	UserAgent     string
	ContentType   string
	ContentLength int
	RawMessage    string
	Headers       map[string]string
	IsRequest     bool
}

var (
	callIDRegex      = regexp.MustCompile(`(?i)^Call-ID:\s*(.+)$`)
	fromRegex        = regexp.MustCompile(`(?i)^From:\s*<?sip:([^@]+)@([^>;\s]+)`)
	toRegex          = regexp.MustCompile(`(?i)^To:\s*<?sip:([^@]+)@([^>;\s]+)`)
	viaRegex         = regexp.MustCompile(`(?i)^Via:\s*(.+)$`)
	contactRegex     = regexp.MustCompile(`(?i)^Contact:\s*(.+)$`)
	cseqRegex        = regexp.MustCompile(`(?i)^CSeq:\s*(\d+)\s+(.+)$`)
	userAgentRegex   = regexp.MustCompile(`(?i)^User-Agent:\s*(.+)$`)
	contentTypeRegex = regexp.MustCompile(`(?i)^Content-Type:\s*(.+)$`)
	contentLenRegex  = regexp.MustCompile(`(?i)^Content-Length:\s*(\d+)$`)
)

var statusCodeTexts = map[int]string{
	100: "Trying",
	180: "Ringing",
	181: "Call Is Being Forwarded",
	182: "Queued",
	183: "Session Progress",
	200: "OK",
	202: "Accepted",
	300: "Multiple Choices",
	301: "Moved Permanently",
	302: "Moved Temporarily",
	305: "Use Proxy",
	380: "Alternative Service",
	400: "Bad Request",
	401: "Unauthorized",
	402: "Payment Required",
	403: "Forbidden",
	404: "Not Found",
	405: "Method Not Allowed",
	406: "Not Acceptable",
	407: "Proxy Authentication Required",
	408: "Request Timeout",
	410: "Gone",
	413: "Request Entity Too Large",
	414: "Request-URI Too Long",
	415: "Unsupported Media Type",
	416: "Unsupported URI Scheme",
	420: "Bad Extension",
	421: "Extension Required",
	422: "Session Timer Too Small",
	423: "Interval Too Brief",
	480: "Temporarily Unavailable",
	481: "Call/Transaction Does Not Exist",
	482: "Loop Detected",
	483: "Too Many Hops",
	484: "Address Incomplete",
	485: "Ambiguous",
	486: "Busy Here",
	487: "Request Terminated",
	488: "Not Acceptable Here",
	491: "Request Pending",
	493: "Undecipherable",
	500: "Server Internal Error",
	501: "Not Implemented",
	502: "Bad Gateway",
	503: "Service Unavailable",
	504: "Server Time-out",
	505: "Version Not Supported",
	513: "Message Too Large",
	600: "Busy Everywhere",
	603: "Decline",
	604: "Does Not Exist Anywhere",
	606: "Not Acceptable",
}

func ParseSIP(data []byte) (*SIPMessage, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty SIP message")
	}

	raw := string(data)
	msg := &SIPMessage{
		RawMessage: raw,
		Headers:    make(map[string]string),
	}

	lines := strings.Split(raw, "\r\n")
	if len(lines) == 0 {
		lines = strings.Split(raw, "\n")
	}

	if len(lines) == 0 {
		return nil, fmt.Errorf("invalid SIP message format")
	}

	firstLine := strings.TrimSpace(lines[0])
	if firstLine == "" {
		return nil, fmt.Errorf("empty first line")
	}

	if strings.HasPrefix(firstLine, "SIP/") {
		msg.IsRequest = false
		parts := strings.SplitN(firstLine, " ", 3)
		if len(parts) >= 2 {
			if code, err := strconv.Atoi(parts[1]); err == nil {
				msg.StatusCode = code
			}
		}
		if len(parts) >= 3 {
			msg.StatusText = parts[2]
		}
		if msg.StatusText == "" && msg.StatusCode > 0 {
			if text, ok := statusCodeTexts[msg.StatusCode]; ok {
				msg.StatusText = text
			}
		}
	} else {
		msg.IsRequest = true
		parts := strings.SplitN(firstLine, " ", 3)
		if len(parts) >= 1 {
			msg.Method = parts[0]
		}
	}

	for i := 1; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}

		if idx := strings.Index(line, ":"); idx > 0 {
			key := strings.TrimSpace(line[:idx])
			value := strings.TrimSpace(line[idx+1:])
			msg.Headers[key] = value
		}

		if matches := callIDRegex.FindStringSubmatch(line); len(matches) == 2 {
			msg.CallID = strings.TrimSpace(matches[1])
		}

		if matches := fromRegex.FindStringSubmatch(line); len(matches) >= 3 {
			msg.FromUser = strings.TrimSpace(matches[1])
			msg.FromHost = strings.TrimSpace(matches[2])
			msg.From = strings.TrimSpace(line)
		}

		if matches := toRegex.FindStringSubmatch(line); len(matches) >= 3 {
			msg.ToUser = strings.TrimSpace(matches[1])
			msg.ToHost = strings.TrimSpace(matches[2])
			msg.To = strings.TrimSpace(line)
		}

		if matches := viaRegex.FindStringSubmatch(line); len(matches) == 2 {
			msg.Via = strings.TrimSpace(matches[1])
		}

		if matches := contactRegex.FindStringSubmatch(line); len(matches) == 2 {
			msg.Contact = strings.TrimSpace(matches[1])
		}

		if matches := cseqRegex.FindStringSubmatch(line); len(matches) == 3 {
			if seqNum, err := strconv.Atoi(matches[1]); err == nil {
				msg.CSeqNum = seqNum
			}
			msg.CSeqMethod = strings.TrimSpace(matches[2])
			msg.CSeq = strings.TrimSpace(line)
		}

		if matches := userAgentRegex.FindStringSubmatch(line); len(matches) == 2 {
			msg.UserAgent = strings.TrimSpace(matches[1])
		}

		if matches := contentTypeRegex.FindStringSubmatch(line); len(matches) == 2 {
			msg.ContentType = strings.TrimSpace(matches[1])
		}

		if matches := contentLenRegex.FindStringSubmatch(line); len(matches) == 2 {
			if l, err := strconv.Atoi(matches[1]); err == nil {
				msg.ContentLength = l
			}
		}
	}

	if msg.CallID == "" {
		return nil, fmt.Errorf("missing Call-ID header")
	}

	return msg, nil
}

func (m *SIPMessage) GetMethod() string {
	if m.Method != "" {
		return m.Method
	}
	if m.StatusCode > 0 {
		return fmt.Sprintf("%d %s", m.StatusCode, m.StatusText)
	}
	if m.CSeqMethod != "" {
		return m.CSeqMethod
	}
	return "UNKNOWN"
}

func (m *SIPMessage) GetResponseMethod() string {
	if m.CSeqMethod != "" {
		return m.CSeqMethod
	}
	return "RESPONSE"
}

func (m *SIPMessage) GetStatusText() string {
	if m.StatusText != "" {
		return m.StatusText
	}
	if text, ok := statusCodeTexts[m.StatusCode]; ok {
		return text
	}
	return "Unknown"
}

func (m *SIPMessage) ToDatabaseMessage(srcIP, dstIP string, srcPort, dstPort int) *database.SIPMessage {
	method := m.Method
	if method == "" && m.StatusCode > 0 {
		method = m.GetResponseMethod()
	}

	return &database.SIPMessage{
		CallID:     m.CallID,
		Method:     method,
		StatusCode: m.StatusCode,
		FromUser:   m.FromUser,
		ToUser:     m.ToUser,
		FromHost:   m.FromHost,
		ToHost:     m.ToHost,
		SourceIP:   srcIP,
		DestIP:     dstIP,
		SourcePort: srcPort,
		DestPort:   dstPort,
		RawMessage: m.RawMessage,
	}
}

func IsImportantMethod(method string) bool {
	method = strings.ToUpper(method)
	switch method {
	case "INVITE", "ACK", "CANCEL", "BYE", "REGISTER", "OPTIONS", "PRACK", "UPDATE", "INFO", "NOTIFY", "REFER", "SUBSCRIBE", "PUBLISH", "MESSAGE":
		return true
	}
	return false
}

func IsImportantStatus(code int) bool {
	switch code {
	case 100, 180, 181, 182, 183,
		200, 202,
		301, 302, 305,
		400, 401, 403, 404, 407, 408, 480, 481, 486, 487, 488,
		500, 503,
		600, 603, 604:
		return true
	}
	return false
}

func GetStatusCodeCategory(code int) string {
	switch {
	case code >= 100 && code < 200:
		return "provisional"
	case code >= 200 && code < 300:
		return "success"
	case code >= 300 && code < 400:
		return "redirection"
	case code >= 400 && code < 500:
		return "client_error"
	case code >= 500 && code < 600:
		return "server_error"
	case code >= 600 && code < 700:
		return "global_failure"
	default:
		return "unknown"
	}
}

func IsSuccessfulResponse(code int) bool {
	return code >= 200 && code < 300
}

func IsFinalResponse(code int) bool {
	return code >= 200
}

func GetCallDirection(msg *SIPMessage) string {
	if msg.IsRequest {
		return "outgoing"
	}
	return "incoming"
}
