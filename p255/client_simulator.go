package main

import (
	"encoding/binary"
	"fmt"
	"net"
	"sync"
	"sync/atomic"
	"time"
)

type TFTPClient struct {
	ServerAddr string
	Conn       *net.UDPConn
	BlockSize  int
	SessionID  string
}

type ConcurrentTestResult struct {
	TotalClients    int32         `json:"total_clients"`
	SuccessClients  int32         `json:"success_clients"`
	FailedClients   int32         `json:"failed_clients"`
	TotalTransfers  int32         `json:"total_transfers"`
	AvgDuration     int64         `json:"avg_duration_ms"`
	BlocksSent      int32         `json:"blocks_sent"`
	Retransmissions int32         `json:"retransmissions"`
	Errors          []string      `json:"errors"`
	Duration        time.Duration `json:"-"`
}

var (
	globalResult ConcurrentTestResult
	resultMutex  sync.Mutex
)

func NewTFTPClient(serverAddr string) (*TFTPClient, error) {
	addr, err := net.ResolveUDPAddr("udp", serverAddr)
	if err != nil {
		return nil, err
	}

	conn, err := net.DialUDP("udp", nil, addr)
	if err != nil {
		return nil, err
	}

	return &TFTPClient{
		ServerAddr: serverAddr,
		Conn:       conn,
		BlockSize:  DefaultBlockSize,
		SessionID:  fmt.Sprintf("client-%d", time.Now().UnixNano()),
	}, nil
}

func (c *TFTPClient) SendRRQWithOptions(filename string, blksize int, tsize bool) error {
	req := make([]byte, 2)
	binary.BigEndian.PutUint16(req, OpRRQ)
	req = append(req, []byte(filename)...)
	req = append(req, 0)
	req = append(req, []byte("octet")...)
	req = append(req, 0)

	if blksize > 0 {
		req = append(req, []byte("blksize")...)
		req = append(req, 0)
		req = append(req, []byte(fmt.Sprintf("%d", blksize))...)
		req = append(req, 0)
		c.BlockSize = blksize
	}

	if tsize {
		req = append(req, []byte("tsize")...)
		req = append(req, 0)
		req = append(req, []byte("0")...)
		req = append(req, 0)
	}

	_, err := c.Conn.Write(req)
	return err
}

func (c *TFTPClient) ReceiveOACK() (map[string]string, error) {
	buf := make([]byte, 512)
	c.Conn.SetReadDeadline(time.Now().Add(5 * time.Second))

	n, _, err := c.Conn.ReadFromUDP(buf)
	if err != nil {
		return nil, err
	}

	opcode := binary.BigEndian.Uint16(buf[0:2])
	if opcode != OpOACK {
		return nil, fmt.Errorf("expected OACK, got opcode %d", opcode)
	}

	options := make(map[string]string)
	parts := splitNull(buf[2:n])
	for i := 0; i+1 < len(parts); i += 2 {
		if parts[i] != "" && parts[i+1] != "" {
			options[parts[i]] = parts[i+1]
		}
	}

	return options, nil
}

func (c *TFTPClient) SimulateDownload(filename string, blksize int, tsize bool) error {
	startTime := time.Now()

	if err := c.SendRRQWithOptions(filename, blksize, tsize); err != nil {
		return fmt.Errorf("RRQ failed: %v", err)
	}

	if blksize > 0 || tsize {
		options, err := c.ReceiveOACK()
		if err != nil {
			return fmt.Errorf("OACK receive failed: %v", err)
		}

		if bs, ok := options["blksize"]; ok {
			fmt.Sscanf(bs, "%d", &c.BlockSize)
		}
	}

	blocksReceived := 0
	expectedBlock := uint16(1)
	buf := make([]byte, 2048)

	for {
		c.Conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		n, _, err := c.Conn.ReadFromUDP(buf)
		if err != nil {
			return fmt.Errorf("DATA receive failed: %v", err)
		}

		opcode := binary.BigEndian.Uint16(buf[0:2])
		if opcode != OpDATA {
			continue
		}

		blockNum := binary.BigEndian.Uint16(buf[2:4])
		dataLen := n - 4

		ack := make([]byte, 4)
		binary.BigEndian.PutUint16(ack, OpACK)
		binary.BigEndian.PutUint16(ack[2:], blockNum)
		c.Conn.Write(ack)

		if blockNum == expectedBlock {
			blocksReceived++
			expectedBlock++
		}

		if dataLen < c.BlockSize {
			break
		}
	}

	duration := time.Since(startTime)
	atomic.AddInt32(&globalResult.BlocksSent, int32(blocksReceived))
	atomic.AddInt64(&globalResult.AvgDuration, duration.Milliseconds())

	return nil
}

func splitNull(data []byte) []string {
	var parts []string
	var current []byte
	for _, b := range data {
		if b == 0 {
			parts = append(parts, string(current))
			current = nil
		} else {
			current = append(current, b)
		}
	}
	if len(current) > 0 {
		parts = append(parts, string(current))
	}
	return parts
}

func RunConcurrentTest(numClients int, filename string, blksize int, tsize bool) ConcurrentTestResult {
	globalResult = ConcurrentTestResult{
		TotalClients: int32(numClients),
		Errors:       make([]string, 0),
	}

	startTime := time.Now()
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 50)

	for i := 0; i < numClients; i++ {
		wg.Add(1)
		semaphore <- struct{}{}

		go func(clientID int) {
			defer wg.Done()
			defer func() { <-semaphore }()

			client, err := NewTFTPClient("localhost:69")
			if err != nil {
				resultMutex.Lock()
				globalResult.FailedClients++
				globalResult.Errors = append(globalResult.Errors,
					fmt.Sprintf("Client %d: connect failed - %v", clientID, err))
				resultMutex.Unlock()
				return
			}
			defer client.Conn.Close()

			err = client.SimulateDownload(filename, blksize, tsize)
			if err != nil {
				resultMutex.Lock()
				globalResult.FailedClients++
				globalResult.Errors = append(globalResult.Errors,
					fmt.Sprintf("Client %d: %v", clientID, err))
				resultMutex.Unlock()
				return
			}

			atomic.AddInt32(&globalResult.SuccessClients, 1)
			atomic.AddInt32(&globalResult.TotalTransfers, 1)
		}(i)
	}

	wg.Wait()

	globalResult.Duration = time.Since(startTime)
	if globalResult.SuccessClients > 0 {
		globalResult.AvgDuration /= int64(globalResult.SuccessClients)
	}

	return globalResult
}
