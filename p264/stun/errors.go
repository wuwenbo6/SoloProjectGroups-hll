package stun

import "errors"

var (
	ErrMessageTooShort  = errors.New("stun: message too short")
	ErrMessageTruncated = errors.New("stun: message truncated")
	ErrInvalidCookie    = errors.New("stun: invalid magic cookie")
)
