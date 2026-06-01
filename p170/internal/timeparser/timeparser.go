package timeparser

import (
	"fmt"
	"strings"
	"time"
)

var timeFormats = []string{
	time.RFC3339Nano,
	time.RFC3339,
	"2006-01-02T15:04:05",
	"2006-01-02 15:04:05",
	"2006-01-02 15:04:05.000000",
	"2006-01-02T15:04:05-0700",
	"2006-01-02T15:04:05.000000-0700",
	"02/Jan/2006:15:04:05 -0700",
	"02/Jan/2006:15:04:05 +0000",
	"02/Jan/2006:15:04:05",
	"Jan _2 15:04:05",
	"Jan _2 15:04:05.000",
	"Mon Jan  2 15:04:05 2006",
	"Mon Jan  2 15:04:05 MST 2006",
	"02-Jan-2006 15:04:05",
	"2006/01/02 15:04:05",
	"2006-01-02",
	"2006/01/02",
}

func Parse(s string) (time.Time, error) {
	s = strings.TrimSpace(s)

	for _, format := range timeFormats {
		if t, err := time.Parse(format, s); err == nil {
			return t, nil
		}
	}

	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t, nil
	}

	return time.Time{}, fmt.Errorf("cannot parse time: %s", s)
}

func ParseWithLocation(s string, loc *time.Location) (time.Time, error) {
	s = strings.TrimSpace(s)

	for _, format := range timeFormats {
		if t, err := time.ParseInLocation(format, s, loc); err == nil {
			return t, nil
		}
	}

	return time.Time{}, fmt.Errorf("cannot parse time: %s", s)
}

func ToRFC3339(t time.Time) string {
	return t.Format(time.RFC3339)
}

func ToRFC3339Nano(t time.Time) string {
	return t.Format(time.RFC3339Nano)
}

func FormatDuration(d time.Duration) string {
	return d.String()
}

func ParseDuration(s string) (time.Duration, error) {
	if len(s) == 0 {
		return 0, nil
	}

	unit := s[len(s)-1]
	valStr := s[:len(s)-1]

	switch unit {
	case 's', 'm', 'h', 'd':
		val, err := parseNumber(valStr)
		if err != nil {
			return 0, err
		}
		switch unit {
		case 's':
			return time.Duration(val) * time.Second, nil
		case 'm':
			return time.Duration(val) * time.Minute, nil
		case 'h':
			return time.Duration(val) * time.Hour, nil
		case 'd':
			return time.Duration(val) * 24 * time.Hour, nil
		}
	}

	return time.ParseDuration(s)
}

func parseNumber(s string) (int64, error) {
	var result int64
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("invalid number: %s", s)
		}
		result = result*10 + int64(c-'0')
	}
	return result, nil
}
