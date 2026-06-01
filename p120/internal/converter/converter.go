package converter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"coap-gateway/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/plgd-dev/go-coap/v3/message"
	"github.com/plgd-dev/go-coap/v3/message/codes"
	"github.com/plgd-dev/go-coap/v3/message/pool"
	"github.com/plgd-dev/go-coap/v3/tcp/client"
)

func HTTPMethodToCoAPCode(method string) codes.Code {
	switch strings.ToUpper(method) {
	case http.MethodGet:
		return codes.GET
	case http.MethodPost:
		return codes.POST
	case http.MethodPut:
		return codes.PUT
	case http.MethodDelete:
		return codes.DELETE
	default:
		return codes.GET
	}
}

func CoAPCodeToHTTPStatus(code codes.Code) int {
	switch code {
	case codes.Empty:
		return http.StatusNoContent
	case codes.Created:
		return http.StatusCreated
	case codes.Deleted:
		return http.StatusOK
	case codes.Valid:
		return http.StatusNotModified
	case codes.Changed:
		return http.StatusOK
	case codes.Content:
		return http.StatusOK
	case codes.BadRequest:
		return http.StatusBadRequest
	case codes.Unauthorized:
		return http.StatusUnauthorized
	case codes.BadOption:
		return http.StatusBadRequest
	case codes.Forbidden:
		return http.StatusForbidden
	case codes.NotFound:
		return http.StatusNotFound
	case codes.MethodNotAllowed:
		return http.StatusMethodNotAllowed
	case codes.NotAcceptable:
		return http.StatusNotAcceptable
	case codes.RequestEntityIncomplete:
		return http.StatusRequestTimeout
	case codes.PreconditionFailed:
		return http.StatusPreconditionFailed
	case codes.RequestEntityTooLarge:
		return http.StatusRequestEntityTooLarge
	case codes.UnsupportedMediaType:
		return http.StatusUnsupportedMediaType
	case codes.InternalServerError:
		return http.StatusInternalServerError
	case codes.NotImplemented:
		return http.StatusNotImplemented
	case codes.BadGateway:
		return http.StatusBadGateway
	case codes.ServiceUnavailable:
		return http.StatusServiceUnavailable
	case codes.GatewayTimeout:
		return http.StatusGatewayTimeout
	case codes.ProxyingNotSupported:
		return http.StatusBadGateway
	default:
		if code >= codes.BadRequest {
			return http.StatusInternalServerError
		}
		return http.StatusOK
	}
}

func ContentTypeCoAPToHTTP(ct message.MediaType) string {
	switch ct {
	case message.TextPlain:
		return "text/plain"
	case message.AppLinkFormat:
		return "application/link-format"
	case message.AppXML:
		return "application/xml"
	case message.AppOctets:
		return "application/octet-stream"
	case message.AppJSON:
		return "application/json"
	default:
		return "application/octet-stream"
	}
}

func ContentTypeHTTPToCoAP(ct string) message.MediaType {
	ct = strings.Split(ct, ";")[0]
	ct = strings.TrimSpace(ct)
	switch ct {
	case "text/plain":
		return message.TextPlain
	case "application/link-format":
		return message.AppLinkFormat
	case "application/xml", "text/xml":
		return message.AppXML
	case "application/octet-stream":
		return message.AppOctets
	case "application/json":
		return message.AppJSON
	default:
		return message.AppOctets
	}
}

func HTTPRequestToCoAPMessage(ctx context.Context, conn *client.Conn, c *gin.Context, coapPath string, token message.Token) (*pool.Message, error) {
	method := c.Request.Method
	coapCode := HTTPMethodToCoAPCode(method)

	msg := conn.AcquireMessage(ctx)
	msg.SetCode(coapCode)
	msg.SetPath(coapPath)

	if token != nil {
		msg.SetToken(token)
	}

	if c.Request.URL.RawQuery != "" {
		for key, values := range c.Request.URL.Query() {
			for _, value := range values {
				msg.AddQuery(fmt.Sprintf("%s=%s", key, value))
			}
		}
	}

	contentType := c.ContentType()
	if contentType != "" {
		ct := ContentTypeHTTPToCoAP(contentType)
		msg.SetContentFormat(ct)
	}

	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		conn.ReleaseMessage(msg)
		return nil, fmt.Errorf("read request body failed: %w", err)
	}
	if len(body) > 0 {
		msg.SetBody(bytes.NewReader(body))
	}

	return msg, nil
}

func CoAPResponseToHTTPResponse(coapResp *pool.Message, httpResp http.ResponseWriter) error {
	statusCode := CoAPCodeToHTTPStatus(coapResp.Code())
	httpResp.WriteHeader(statusCode)

	ct, err := coapResp.ContentFormat()
	if err == nil {
		httpResp.Header().Set("Content-Type", ContentTypeCoAPToHTTP(ct))
	}

	token := coapResp.Token()
	if len(token) > 0 {
		httpResp.Header().Set("X-CoAP-Token", fmt.Sprintf("%x", token))
	}

	observe, err := coapResp.Observe()
	if err == nil {
		httpResp.Header().Set("X-CoAP-Observe", fmt.Sprintf("%d", observe))
	}

	body, err := io.ReadAll(coapResp.Body())
	if err != nil {
		return fmt.Errorf("read coap response body failed: %w", err)
	}
	if len(body) > 0 {
		_, err = httpResp.Write(body)
		return err
	}

	return nil
}

func CoAPMessageToModel(msg *pool.Message, path string) *models.CoAPMessage {
	ct, _ := msg.ContentFormat()
	observe, _ := msg.Observe()

	var payload []byte
	if msg.Body() != nil {
		payload, _ = io.ReadAll(msg.Body())
		msg.SetBody(bytes.NewReader(payload))
	}

	queries, _ := msg.Queries()
	messageID := msg.MessageID()
	if messageID < 0 {
		messageID = 0
	}

	return &models.CoAPMessage{
		MessageID:   uint16(messageID),
		Type:        msg.Type().String(),
		Code:        msg.Code().String(),
		Token:       fmt.Sprintf("%x", msg.Token()),
		Path:        path,
		Query:       strings.Join(queries, "&"),
		Payload:     payload,
		ContentType: message.MediaType(ct).String(),
		Observe:     observe,
	}
}

func CoAPPayloadToSSEEvent(coapMsg *models.CoAPMessage, deviceID string) *models.SSEEvent {
	data := map[string]interface{}{
		"device_id": deviceID,
		"path":      coapMsg.Path,
		"payload":   string(coapMsg.Payload),
		"timestamp": coapMsg.MessageID,
	}

	jsonData, _ := json.Marshal(data)

	return &models.SSEEvent{
		ID:    coapMsg.Token,
		Event: "device_data",
		Data:  string(jsonData),
	}
}

func WriteSSEEvent(w gin.ResponseWriter, event *models.SSEEvent) {
	if event.ID != "" {
		fmt.Fprintf(w, "id: %s\n", event.ID)
	}
	if event.Event != "" {
		fmt.Fprintf(w, "event: %s\n", event.Event)
	}
	if event.Data != "" {
		lines := strings.Split(event.Data, "\n")
		for _, line := range lines {
			fmt.Fprintf(w, "data: %s\n", line)
		}
	}
	fmt.Fprint(w, "\n")
	w.Flush()
}

func MQTTToCoAPMessage(ctx context.Context, conn *client.Conn, payload []byte, path string, method string) (*pool.Message, error) {
	coapCode := HTTPMethodToCoAPCode(method)

	msg := conn.AcquireMessage(ctx)
	msg.SetCode(coapCode)
	msg.SetPath(path)

	if len(payload) > 0 {
		msg.SetBody(bytes.NewReader(payload))
		msg.SetContentFormat(message.AppJSON)
	}

	return msg, nil
}

func CoAPToMQTTPayload(resp *pool.Message) ([]byte, error) {
	ct, _ := resp.ContentFormat()
	body, err := io.ReadAll(resp.Body())
	if err != nil {
		return nil, fmt.Errorf("read coap body failed: %w", err)
	}
	resp.SetBody(bytes.NewReader(body))

	contentType := ContentTypeCoAPToHTTP(ct)

	if contentType == "application/json" {
		return body, nil
	}

	result := map[string]interface{}{
		"code":         resp.Code().String(),
		"content_type": contentType,
		"payload":      string(body),
	}

	return json.Marshal(result)
}
