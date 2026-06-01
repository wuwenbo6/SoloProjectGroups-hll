package ptz

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"rtsp-proxy/internal/database"
)

type PTZConfig struct {
	Timeout time.Duration
}

type PTZController struct {
	db     *database.DB
	config PTZConfig
	creds  map[string]PTZCredentials
}

type PTZCredentials struct {
	OnvifURL  string
	Username  string
	Password  string
	Profile   string
	StreamID  string
}

type PTZCommand string

const (
	CmdUp       PTZCommand = "up"
	CmdDown     PTZCommand = "down"
	CmdLeft     PTZCommand = "left"
	CmdRight    PTZCommand = "right"
	CmdZoomIn   PTZCommand = "zoomIn"
	CmdZoomOut  PTZCommand = "zoomOut"
	CmdStop     PTZCommand = "stop"
	CmdPreset1  PTZCommand = "preset1"
	CmdPreset2  PTZCommand = "preset2"
	CmdPreset3  PTZCommand = "preset3"
	CmdPreset4  PTZCommand = "preset4"
)

type soapEnvelope struct {
	XMLName xml.Name `xml:"http://www.w3.org/2003/05/soap-envelope Envelope"`
	Body    soapBody `xml:"Body"`
}

type soapBody struct {
	ContinuousMove *continuousMove `xml:",omitempty"`
	Stop           *stopMove       `xml:",omitempty"`
	GotoPreset     *gotoPreset     `xml:",omitempty"`
}

type continuousMove struct {
	XMLName      xml.Name     `xml:"http://www.onvif.org/ver20/ptz/wsdl ContinuousMove"`
	ProfileToken string       `xml:"ProfileToken"`
	Velocity     velocityType `xml:"Velocity"`
	Timeout      string       `xml:"Timeout,omitempty"`
}

type velocityType struct {
	PanTilt  *panTiltVelocity  `xml:"PanTilt,omitempty"`
	Zoom     *zoomVelocity     `xml:"Zoom,omitempty"`
}

type panTiltVelocity struct {
	X     float64 `xml:"x,attr"`
	Y     float64 `xml:"y,attr"`
	Space string  `xml:"space,attr,omitempty"`
}

type zoomVelocity struct {
	X     float64 `xml:"x,attr"`
	Space string  `xml:"space,attr,omitempty"`
}

type stopMove struct {
	XMLName      xml.Name `xml:"http://www.onvif.org/ver20/ptz/wsdl Stop"`
	ProfileToken string   `xml:"ProfileToken"`
	PanTilt      bool     `xml:"PanTilt,omitempty"`
	Zoom         bool     `xml:"Zoom,omitempty"`
}

type gotoPreset struct {
	XMLName      xml.Name `xml:"http://www.onvif.org/ver20/ptz/wsdl GotoPreset"`
	ProfileToken string   `xml:"ProfileToken"`
	PresetToken  string   `xml:"PresetToken"`
}

func NewPTZController(db *database.DB, config PTZConfig) *PTZController {
	if config.Timeout == 0 {
		config.Timeout = 5 * time.Second
	}

	return &PTZController{
		db:     db,
		config: config,
		creds:  make(map[string]PTZCredentials),
	}
}

func (p *PTZController) RegisterCamera(streamID, rtspURL, username, password string) {
	u, err := url.Parse(rtspURL)
	if err != nil {
		return
	}

	host := u.Hostname()
	port := u.Port()
	if port == "" {
		port = "80"
	}

	onvifURL := fmt.Sprintf("http://%s:%s/onvif/device_service", host, port)

	p.creds[streamID] = PTZCredentials{
		OnvifURL: onvifURL,
		Username: username,
		Password: password,
		Profile:  "Profile_1",
		StreamID: streamID,
	}
}

func (p *PTZController) GetCredentials(streamID string) (PTZCredentials, bool) {
	cred, exists := p.creds[streamID]
	return cred, exists
}

func (p *PTZController) ExecuteCommand(streamID string, cmd PTZCommand, speed float64) error {
	cred, exists := p.creds[streamID]
	if !exists {
		stream, err := p.db.GetStream(streamID)
		if err != nil {
			return fmt.Errorf("stream not found and no PTZ credentials registered")
		}
		
		u, err := url.Parse(stream.RTSPURL)
		if err != nil {
			return fmt.Errorf("invalid RTSP URL")
		}
		
		username := u.User.Username()
		password, _ := u.User.Password()
		
		p.RegisterCamera(streamID, stream.RTSPURL, username, password)
		cred = p.creds[streamID]
	}

	switch cmd {
	case CmdUp:
		return p.move(cred, 0, speed, 0)
	case CmdDown:
		return p.move(cred, 0, -speed, 0)
	case CmdLeft:
		return p.move(cred, -speed, 0, 0)
	case CmdRight:
		return p.move(cred, speed, 0, 0)
	case CmdZoomIn:
		return p.move(cred, 0, 0, speed)
	case CmdZoomOut:
		return p.move(cred, 0, 0, -speed)
	case CmdStop:
		return p.stop(cred)
	case CmdPreset1, CmdPreset2, CmdPreset3, CmdPreset4:
		presetNum := strings.TrimPrefix(string(cmd), "preset")
		return p.gotoPreset(cred, presetNum)
	default:
		return fmt.Errorf("unknown command: %s", cmd)
	}
}

func (p *PTZController) move(cred PTZCredentials, pan, tilt, zoom float64) error {
	env := soapEnvelope{
		Body: soapBody{
			ContinuousMove: &continuousMove{
				ProfileToken: cred.Profile,
				Velocity:     velocityType{},
				Timeout:      "PT1S",
			},
		},
	}

	if pan != 0 || tilt != 0 {
		env.Body.ContinuousMove.Velocity.PanTilt = &panTiltVelocity{
			X: pan,
			Y: tilt,
		}
	}

	if zoom != 0 {
		env.Body.ContinuousMove.Velocity.Zoom = &zoomVelocity{
			X: zoom,
		}
	}

	return p.sendSOAP(cred, env)
}

func (p *PTZController) stop(cred PTZCredentials) error {
	env := soapEnvelope{
		Body: soapBody{
			Stop: &stopMove{
				ProfileToken: cred.Profile,
				PanTilt:      true,
				Zoom:         true,
			},
		},
	}
	return p.sendSOAP(cred, env)
}

func (p *PTZController) gotoPreset(cred PTZCredentials, presetToken string) error {
	env := soapEnvelope{
		Body: soapBody{
			GotoPreset: &gotoPreset{
				ProfileToken: cred.Profile,
				PresetToken:  presetToken,
			},
		},
	}
	return p.sendSOAP(cred, env)
}

func (p *PTZController) sendSOAP(cred PTZCredentials, env soapEnvelope) error {
	data, err := xml.MarshalIndent(env, "", "  ")
	if err != nil {
		return err
	}

	soapReq := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
%s`, string(data))

	req, err := http.NewRequest("POST", cred.OnvifURL, bytes.NewBufferString(soapReq))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/soap+xml; charset=utf-8")
	req.SetBasicAuth(cred.Username, cred.Password)

	client := &http.Client{
		Timeout: p.config.Timeout,
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		return fmt.Errorf("PTZ command failed: %s - %s", resp.Status, string(body))
	}

	return nil
}

func (p *PTZController) MoveUp(streamID string, speed float64) error {
	return p.ExecuteCommand(streamID, CmdUp, speed)
}

func (p *PTZController) MoveDown(streamID string, speed float64) error {
	return p.ExecuteCommand(streamID, CmdDown, speed)
}

func (p *PTZController) MoveLeft(streamID string, speed float64) error {
	return p.ExecuteCommand(streamID, CmdLeft, speed)
}

func (p *PTZController) MoveRight(streamID string, speed float64) error {
	return p.ExecuteCommand(streamID, CmdRight, speed)
}

func (p *PTZController) ZoomIn(streamID string, speed float64) error {
	return p.ExecuteCommand(streamID, CmdZoomIn, speed)
}

func (p *PTZController) ZoomOut(streamID string, speed float64) error {
	return p.ExecuteCommand(streamID, CmdZoomOut, speed)
}

func (p *PTZController) Stop(streamID string) error {
	return p.ExecuteCommand(streamID, CmdStop, 0)
}

func (p *PTZController) GotoPreset(streamID string, preset string) error {
	cmd := PTZCommand("preset" + preset)
	return p.ExecuteCommand(streamID, cmd, 0)
}
