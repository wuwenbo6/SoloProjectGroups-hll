package rdma

import "errors"

var (
	ErrInvalidTransition = errors.New("invalid QP state transition")
	ErrQPNotReady        = errors.New("QP not in ready state")
	ErrSQFull            = errors.New("send queue full")
	ErrRQFull            = errors.New("receive queue full")
	ErrOutOfRange        = errors.New("memory access out of range")
	ErrWRNotFound        = errors.New("work request not found")
	ErrInvalidOpcode     = errors.New("invalid work request opcode")
)
