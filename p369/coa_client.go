package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"layeh.com/radius"
	"layeh.com/radius/rfc2865"
	"layeh.com/radius/rfc2866"
	"layeh.com/radius/rfc3576"
)

type CoAClient struct {
	secret  []byte
	timeout time.Duration
}

type CoAResult struct {
	Code       radius.Code `json:"code"`
	CodeName   string      `json:"code_name"`
	SessionID  string      `json:"session_id"`
	ErrorCause uint32      `json:"error_cause,omitempty"`
	Error      string      `json:"error,omitempty"`
}

func NewCoAClient(secret string) *CoAClient {
	return &CoAClient{
		secret:  []byte(secret),
		timeout: 5 * time.Second,
	}
}

func (c *CoAClient) SendCoARequest(targetAddr, sessionID, username string, bandwidthUp, bandwidthDown uint32, sessionTimeout uint32, filterID, vendor string, useVendorAVP bool) *CoAResult {
	result := &CoAResult{
		SessionID: sessionID,
	}

	packet := radius.New(radius.CodeCoARequest, c.secret)

	rfc2866.AcctSessionID_SetString(packet, sessionID)

	if username != "" {
		rfc2865.UserName_SetString(packet, username)
	}

	if sessionTimeout > 0 {
		rfc2865.SessionTimeout_Set(packet, rfc2865.SessionTimeout(sessionTimeout))
	}

	if filterID != "" {
		rfc2865.FilterID_SetString(packet, filterID)
	}

	if bandwidthUp > 0 || bandwidthDown > 0 {
		if useVendorAVP && vendor != "" && vendor != "standard" {
			c.addVendorBandwidthAVP(packet, vendor, bandwidthUp, bandwidthDown)
		} else {
			if bandwidthUp > 0 {
				attr := radius.NewInteger(bandwidthUp)
				packet.Add(107, attr)
			}
			if bandwidthDown > 0 {
				attr := radius.NewInteger(bandwidthDown)
				packet.Add(108, attr)
			}
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), c.timeout)
	defer cancel()

	log.Printf("Sending CoA-Request to %s: session=%s user=%s bw_up=%d bw_down=%d timeout=%d filter=%s vendor=%s vendor_avp=%v",
		targetAddr, sessionID, username, bandwidthUp, bandwidthDown, sessionTimeout, filterID, vendor, useVendorAVP)

	response, err := radius.Exchange(ctx, packet, targetAddr)
	if err != nil {
		result.Error = fmt.Sprintf("exchange failed: %v", err)
		result.CodeName = "Error"
		return result
	}

	result.Code = response.Code
	result.CodeName = response.Code.String()

	if response.Code == radius.CodeCoANAK {
		if ec, err := lookupErrorCause(response); err == nil {
			result.ErrorCause = ec
		}
	}

	log.Printf("CoA Response from %s: code=%s session=%s", targetAddr, response.Code, sessionID)

	return result
}

func (c *CoAClient) addVendorBandwidthAVP(packet *radius.Packet, vendor string, up, down uint32) {
	switch vendor {
	case "cisco":
		if up > 0 {
			packet.Add(AttributeVendorSpecific, NewCiscoAVPPair("bandwidth-up", fmt.Sprintf("%d", up)))
		}
		if down > 0 {
			packet.Add(AttributeVendorSpecific, NewCiscoAVPPair("bandwidth-down", fmt.Sprintf("%d", down)))
		}
	case "huawei":
		if up > 0 {
			packet.Add(AttributeVendorSpecific, NewVendorInteger(VendorHuawei, HuaweiUpBandwidth, up))
		}
		if down > 0 {
			packet.Add(AttributeVendorSpecific, NewVendorInteger(VendorHuawei, HuaweiDownBandwidth, down))
		}
	}
}

func (c *CoAClient) SendDisconnectRequest(targetAddr, sessionID, username string) *CoAResult {
	result := &CoAResult{
		SessionID: sessionID,
	}

	packet := radius.New(radius.CodeDisconnectRequest, c.secret)

	rfc2866.AcctSessionID_SetString(packet, sessionID)

	if username != "" {
		rfc2865.UserName_SetString(packet, username)
	}

	ctx, cancel := context.WithTimeout(context.Background(), c.timeout)
	defer cancel()

	log.Printf("Sending Disconnect-Request to %s: session=%s user=%s", targetAddr, sessionID, username)

	response, err := radius.Exchange(ctx, packet, targetAddr)
	if err != nil {
		result.Error = fmt.Sprintf("exchange failed: %v", err)
		result.CodeName = "Error"
		return result
	}

	result.Code = response.Code
	result.CodeName = response.Code.String()

	if response.Code == radius.CodeDisconnectNAK {
		if ec, err := lookupErrorCause(response); err == nil {
			result.ErrorCause = ec
		}
	}

	log.Printf("Disconnect Response from %s: code=%s session=%s", targetAddr, response.Code, sessionID)

	return result
}

func lookupErrorCause(p *radius.Packet) (uint32, error) {
	a, ok := p.Lookup(rfc3576.ErrorCause_Type)
	if !ok {
		return 0, fmt.Errorf("no Error-Cause attribute")
	}
	val, err := radius.Integer(a)
	if err != nil {
		return 0, err
	}
	return val, nil
}
