package sdp

import (
	"encoding/base64"
	"fmt"
	"strings"
)

type MediaType int

const (
	Video MediaType = iota
	Audio
)

type MediaDescription struct {
	Type        MediaType
	Port        int
	Protocol    string
	PayloadType int
	Codec       string
	ClockRate   int
	Channels    int
	SpropParams string
	Config      string
	ControlURL  string
}

type SessionDescription struct {
	Version     int
	Origin      string
	SessionName string
	Connection  string
	Time        string
	Medias      []*MediaDescription
}

func NewSessionDescription() *SessionDescription {
	return &SessionDescription{
		Version:     0,
		Origin:      "- 0 0 IN IP4 0.0.0.0",
		SessionName: "RTSP Server",
		Connection:  "IN IP4 0.0.0.0",
		Time:        "0 0",
		Medias:      make([]*MediaDescription, 0),
	}
}

func (s *SessionDescription) AddMedia(media *MediaDescription) {
	s.Medias = append(s.Medias, media)
}

func (s *SessionDescription) String() string {
	var b strings.Builder

	fmt.Fprintf(&b, "v=%d\r\n", s.Version)
	fmt.Fprintf(&b, "o=%s\r\n", s.Origin)
	fmt.Fprintf(&b, "s=%s\r\n", s.SessionName)
	fmt.Fprintf(&b, "c=%s\r\n", s.Connection)
	fmt.Fprintf(&b, "t=%s\r\n", s.Time)

	for _, m := range s.Medias {
		b.WriteString(m.String())
	}

	return b.String()
}

func (m *MediaDescription) String() string {
	var b strings.Builder

	mediaType := "video"
	if m.Type == Audio {
		mediaType = "audio"
	}

	fmt.Fprintf(&b, "m=%s %d %s %d\r\n", mediaType, m.Port, m.Protocol, m.PayloadType)
	fmt.Fprintf(&b, "a=rtpmap:%d %s/%d", m.PayloadType, m.Codec, m.ClockRate)

	if m.Type == Audio && m.Channels > 0 {
		fmt.Fprintf(&b, "/%d", m.Channels)
	}
	b.WriteString("\r\n")

	if m.Type == Video && m.SpropParams != "" {
		fmt.Fprintf(&b, "a=fmtp:%d packetization-mode=1; sprop-parameter-sets=%s\r\n", m.PayloadType, m.SpropParams)
	}

	if m.Type == Audio && m.Config != "" {
		fmt.Fprintf(&b, "a=fmtp:%d streamtype=5; profile-level-id=15; mode=AAC-hbr; config=%s; SizeLength=13; IndexLength=3; IndexDeltaLength=3\r\n",
			m.PayloadType, m.Config)
	}

	fmt.Fprintf(&b, "a=control:%s\r\n", m.ControlURL)

	return b.String()
}

func BuildVideoSDP(sps, pps []byte, controlURL string) string {
	sdp := NewSessionDescription()

	sprop := fmt.Sprintf("%s,%s",
		encodeBase64(sps),
		encodeBase64(pps),
	)

	media := &MediaDescription{
		Type:        Video,
		Port:        0,
		Protocol:    "RTP/AVP",
		PayloadType: 96,
		Codec:       "H264",
		ClockRate:   90000,
		SpropParams: sprop,
		ControlURL:  controlURL,
	}

	sdp.AddMedia(media)
	return sdp.String()
}

func BuildAudioVideoSDP(videoSPS, videoPPS []byte, audioASC []byte, audioSampleRate, audioChannels int) string {
	sdp := NewSessionDescription()

	videoSprop := fmt.Sprintf("%s,%s",
		encodeBase64(videoSPS),
		encodeBase64(videoPPS),
	)

	videoMedia := &MediaDescription{
		Type:        Video,
		Port:        0,
		Protocol:    "RTP/AVP",
		PayloadType: 96,
		Codec:       "H264",
		ClockRate:   90000,
		SpropParams: videoSprop,
		ControlURL:  "track1",
	}
	sdp.AddMedia(videoMedia)

	audioConfig := encodeHex(audioASC)
	audioMedia := &MediaDescription{
		Type:        Audio,
		Port:        0,
		Protocol:    "RTP/AVP",
		PayloadType: 97,
		Codec:       "MP4A-LATM",
		ClockRate:   audioSampleRate,
		Channels:    audioChannels,
		Config:      audioConfig,
		ControlURL:  "track2",
	}
	sdp.AddMedia(audioMedia)

	return sdp.String()
}

func encodeBase64(data []byte) string {
	return base64.StdEncoding.EncodeToString(data)
}

func encodeHex(data []byte) string {
	const hexChars = "0123456789ABCDEF"
	var result strings.Builder
	for _, b := range data {
		result.WriteByte(hexChars[b>>4])
		result.WriteByte(hexChars[b&0x0F])
	}
	return result.String()
}
