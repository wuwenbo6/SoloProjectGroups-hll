package protocol

import (
	"encoding/binary"
	"fmt"
	"time"
)

type CP56Time2a struct {
	Msec        uint16
	Min         byte
	Hour        byte
	Day         byte
	Month       byte
	Year        byte
	Weekday     byte
	SU          bool
	IV          bool
	Substituted bool
	Invalid     bool
}

func CP56Time2aFromTime(t time.Time) CP56Time2a {
	msec := uint16(t.Nanosecond()/int(1000000)) + uint16(t.Second())*1000
	wd := byte(t.Weekday())
	if wd == 0 {
		wd = 7
	}
	return CP56Time2a{
		Msec:    msec,
		Min:     byte(t.Minute()),
		Hour:    byte(t.Hour()),
		Day:     byte(t.Day()),
		Month:   byte(t.Month()),
		Year:    byte(t.Year() - 2000),
		Weekday: wd,
	}
}

func NowCP56Time2a() CP56Time2a {
	return CP56Time2aFromTime(time.Now())
}

func (t CP56Time2a) ToTime() time.Time {
	year := int(t.Year) + 2000
	return time.Date(year, time.Month(t.Month), int(t.Day), int(t.Hour), int(t.Min),
		int(t.Msec/1000), int(t.Msec%1000)*1000000, time.Local)
}

func (t CP56Time2a) String() string {
	weekdays := []string{"", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
	wd := ""
	if t.Weekday >= 1 && t.Weekday <= 7 {
		wd = weekdays[t.Weekday] + " "
	}
	return fmt.Sprintf("%s%04d-%02d-%02d %02d:%02d:%02d.%03d",
		wd, int(t.Year)+2000, t.Month, t.Day, t.Hour, t.Min, t.Msec/1000, t.Msec%1000)
}

func (t CP56Time2a) Marshal() []byte {
	buf := make([]byte, 7)
	binary.LittleEndian.PutUint16(buf[0:2], t.Msec)
	buf[2] = t.Min & 0x3F
	if t.SU {
		buf[2] |= 0x40
	}
	if t.IV {
		buf[2] |= 0x80
	}
	buf[3] = t.Hour & 0x1F
	if t.Substituted {
		buf[3] |= 0x80
	}
	buf[4] = t.Day & 0x1F
	buf[4] |= (t.Weekday & 0x07) << 5
	buf[5] = t.Month & 0x0F
	buf[6] = t.Year
	return buf
}

func ParseCP56Time2a(data []byte) CP56Time2a {
	if len(data) < 7 {
		return CP56Time2a{}
	}
	msec := binary.LittleEndian.Uint16(data[0:2])
	min := data[2] & 0x3F
	su := (data[2] & 0x40) != 0
	iv := (data[2] & 0x80) != 0
	hour := data[3] & 0x1F
	substituted := (data[3] & 0x80) != 0
	day := data[4] & 0x1F
	weekday := (data[4] >> 5) & 0x07
	month := data[5] & 0x0F
	year := data[6]
	return CP56Time2a{
		Msec:        msec,
		Min:         min,
		Hour:        hour,
		Day:         day,
		Month:       month,
		Year:        year,
		Weekday:     weekday,
		SU:          su,
		IV:          iv,
		Substituted: substituted,
		Invalid:     iv,
	}
}
