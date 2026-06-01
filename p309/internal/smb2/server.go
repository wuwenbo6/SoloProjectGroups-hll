package smb2

import (
	"errors"
	"fmt"
	"smb2-lease-server/internal/lease"
	"sync"
	"time"
)

type SMB2Command uint16

const (
	SMB2Negotiate     SMB2Command = 0x0000
	SMB2SessionSetup  SMB2Command = 0x0001
	SMB2TreeConnect   SMB2Command = 0x0002
	SMB2Create        SMB2Command = 0x0005
	SMB2Close         SMB2Command = 0x0006
	SMB2Read          SMB2Command = 0x0008
	SMB2Write         SMB2Command = 0x0009
)

type FileHandle struct {
	ID         string
	ClientID   string
	FileName   string
	Lease      *lease.Lease
	LeaseState lease.LeaseState
	OpenedAt   time.Time
}

type SMB2Server struct {
	mu           sync.RWMutex
	leaseManager *lease.LeaseManager
	files        map[string]*FileData
	handles      map[string]*FileHandle
	clients      map[string]*SMB2Client
}

type FileData struct {
	Name     string
	Content  []byte
	Size     int64
	Modified time.Time
}

type SMB2Client struct {
	ID            string
	Name          string
	Connected     bool
	EventChan     chan lease.LeaseEvent
	ResponseChan  chan bool
	Handles       map[string]*FileHandle
}

type SMB2Request struct {
	Command  SMB2Command
	ClientID string
	FileName string
	Data     []byte
	Offset   int64
	LeaseType lease.LeaseType
}

type SMB2Response struct {
	Success  bool
	Message  string
	Data     []byte
	FileSize int64
	Lease    *lease.Lease
}

func NewSMB2Server(lm *lease.LeaseManager) *SMB2Server {
	server := &SMB2Server{
		leaseManager: lm,
		files:        make(map[string]*FileData),
		handles:      make(map[string]*FileHandle),
		clients:      make(map[string]*SMB2Client),
	}
	server.initDefaultFiles()
	return server
}

func (s *SMB2Server) initDefaultFiles() {
	s.files["document.txt"] = &FileData{
		Name:     "document.txt",
		Content:  []byte("This is a shared document for testing SMB2 lease functionality.\nMultiple clients can open this file simultaneously."),
		Size:     96,
		Modified: time.Now(),
	}
	s.files["data.csv"] = &FileData{
		Name:     "data.csv",
		Content:  []byte("id,name,value\n1,test,100\n2,demo,200"),
		Size:     41,
		Modified: time.Now(),
	}
}

func (s *SMB2Server) ConnectClient(clientID, clientName string) (*SMB2Client, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.clients[clientID]; exists {
		return nil, fmt.Errorf("client %s already connected", clientID)
	}

	eventChan := make(chan lease.LeaseEvent, 10)
	responseChan := s.leaseManager.RegisterClient(clientID, eventChan)

	client := &SMB2Client{
		ID:           clientID,
		Name:         clientName,
		Connected:    true,
		EventChan:    eventChan,
		ResponseChan: responseChan,
		Handles:      make(map[string]*FileHandle),
	}
	s.clients[clientID] = client

	go s.listenClientEvents(client)

	return client, nil
}

func (s *SMB2Server) listenClientEvents(client *SMB2Client) {
	for event := range client.EventChan {
		s.mu.RLock()
		for _, handle := range client.Handles {
			if handle.FileName == event.FileName {
				switch event.Type {
				case "LEASE_BREAK":
					handle.LeaseState = lease.LeaseStateBreaking
					go func(c *SMB2Client) {
						time.Sleep(10 * time.Millisecond)
						s.leaseManager.AcknowledgeLeaseBreak(c.ID)
					}(client)
				case "LEASE_DOWNGRADE":
					handle.LeaseState = lease.LeaseStateDowngrading
					if handle.Lease != nil {
						handle.Lease.Type = lease.LeaseTypeRead
						handle.Lease.Downgraded = true
					}
				}
			}
		}
		s.mu.RUnlock()
	}
}

func (s *SMB2Server) DisconnectClient(clientID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if client, exists := s.clients[clientID]; exists {
		for handleID := range client.Handles {
			s.closeHandle(handleID)
		}
		delete(s.clients, clientID)
		s.leaseManager.UnregisterClient(clientID)
	}
}

func (s *SMB2Server) ProcessRequest(req *SMB2Request) (*SMB2Response, error) {
	switch req.Command {
	case SMB2Create:
		return s.handleCreate(req)
	case SMB2Close:
		return s.handleClose(req)
	case SMB2Read:
		return s.handleRead(req)
	case SMB2Write:
		return s.handleWrite(req)
	default:
		return &SMB2Response{Success: false, Message: "Unknown command"}, nil
	}
}

func (s *SMB2Server) handleCreate(req *SMB2Request) (*SMB2Response, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.files[req.FileName]; !exists {
		s.files[req.FileName] = &FileData{
			Name:     req.FileName,
			Content:  []byte{},
			Size:     0,
			Modified: time.Now(),
		}
	}

	client, exists := s.clients[req.ClientID]
	if !exists {
		return nil, errors.New("client not connected")
	}

	leaseType := req.LeaseType
	if leaseType == "" {
		leaseType = lease.LeaseTypeRead
	}

	leaseObj, err := s.leaseManager.RequestLease(req.ClientID, req.FileName, leaseType)
	if err != nil {
		return nil, err
	}

	handleID := fmt.Sprintf("%s-%s-%d", req.ClientID, req.FileName, time.Now().UnixNano())
	handle := &FileHandle{
		ID:         handleID,
		ClientID:   req.ClientID,
		FileName:   req.FileName,
		Lease:      leaseObj,
		LeaseState: leaseObj.State,
		OpenedAt:   time.Now(),
	}

	s.handles[handleID] = handle
	client.Handles[handleID] = handle

	return &SMB2Response{
		Success:  true,
		Message:  fmt.Sprintf("File %s opened with %s lease", req.FileName, leaseType),
		Lease:    leaseObj,
	}, nil
}

func (s *SMB2Server) handleClose(req *SMB2Request) (*SMB2Response, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	client, exists := s.clients[req.ClientID]
	if !exists {
		return nil, errors.New("client not connected")
	}

	var handleToClose *FileHandle
	for _, handle := range client.Handles {
		if handle.FileName == req.FileName {
			handleToClose = handle
			break
		}
	}

	if handleToClose != nil {
		s.closeHandle(handleToClose.ID)
		return &SMB2Response{
			Success: true,
			Message: fmt.Sprintf("File %s closed", req.FileName),
		}, nil
	}

	return &SMB2Response{Success: false, Message: "File handle not found"}, nil
}

func (s *SMB2Server) closeHandle(handleID string) {
	if handle, exists := s.handles[handleID]; exists {
		client := s.clients[handle.ClientID]
		if client != nil {
			delete(client.Handles, handleID)
		}
		s.leaseManager.ReleaseLease(handle.Lease.ID)
		delete(s.handles, handleID)
	}
}

func (s *SMB2Server) handleRead(req *SMB2Request) (*SMB2Response, error) {
	s.mu.RLock()
	_, clientExists := s.clients[req.ClientID]
	if !clientExists {
		s.mu.RUnlock()
		return nil, errors.New("client not connected")
	}

	file, exists := s.files[req.FileName]
	if !exists {
		s.mu.RUnlock()
		return &SMB2Response{Success: false, Message: "File not found"}, nil
	}
	s.mu.RUnlock()

	downgradedLeases := s.leaseManager.DowngradeLeasesForFile(
		req.FileName,
		req.ClientID,
		fmt.Sprintf("Read operation by client %s requires exclusive access", req.ClientID),
	)

	s.mu.RLock()
	defer s.mu.RUnlock()

	file, exists = s.files[req.FileName]
	if !exists {
		return &SMB2Response{Success: false, Message: "File not found"}, nil
	}

	data := file.Content
	if req.Offset < int64(len(file.Content)) {
		data = file.Content[req.Offset:]
	}

	message := fmt.Sprintf("Read successful, %d bytes", len(data))
	if len(downgradedLeases) > 0 {
		message += fmt.Sprintf(" | Downgraded %d WRITE/BATCH leases to READ for other clients", len(downgradedLeases))
	}

	return &SMB2Response{
		Success:  true,
		Message:  message,
		Data:     data,
		FileSize: file.Size,
	}, nil
}

func (s *SMB2Server) handleWrite(req *SMB2Request) (*SMB2Response, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	file, exists := s.files[req.FileName]
	if !exists {
		return &SMB2Response{Success: false, Message: "File not found"}, nil
	}

	_, clientExists := s.clients[req.ClientID]
	if !clientExists {
		return nil, errors.New("client not connected")
	}

	brokenLeases := s.leaseManager.BreakLeasesForFile(
		req.FileName,
		req.ClientID,
		fmt.Sprintf("Write operation by client %s", req.ClientID),
	)

	if req.Offset >= int64(len(file.Content)) {
		file.Content = append(file.Content, req.Data...)
	} else {
		if req.Offset+int64(len(req.Data)) > int64(len(file.Content)) {
			newContent := make([]byte, req.Offset+int64(len(req.Data)))
			copy(newContent, file.Content[:req.Offset])
			copy(newContent[req.Offset:], req.Data)
			file.Content = newContent
		} else {
			copy(file.Content[req.Offset:], req.Data)
		}
	}

	file.Size = int64(len(file.Content))
	file.Modified = time.Now()

	message := fmt.Sprintf("Write successful, %d bytes written", len(req.Data))
	if len(brokenLeases) > 0 {
		message += fmt.Sprintf(" | Broke %d leases for other clients", len(brokenLeases))
	}

	return &SMB2Response{
		Success:  true,
		Message:  message,
		FileSize: file.Size,
	}, nil
}

func (s *SMB2Server) GetClients() []*SMB2Client {
	s.mu.RLock()
	defer s.mu.RUnlock()

	clients := make([]*SMB2Client, 0, len(s.clients))
	for _, client := range s.clients {
		clients = append(clients, client)
	}
	return clients
}

func (s *SMB2Server) GetFiles() []*FileData {
	s.mu.RLock()
	defer s.mu.RUnlock()

	files := make([]*FileData, 0, len(s.files))
	for _, file := range s.files {
		files = append(files, file)
	}
	return files
}

func (s *SMB2Server) GetFile(fileName string) (*FileData, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	file, exists := s.files[fileName]
	return file, exists
}

func (s *SMB2Server) GetHandles() []*FileHandle {
	s.mu.RLock()
	defer s.mu.RUnlock()

	handles := make([]*FileHandle, 0, len(s.handles))
	for _, handle := range s.handles {
		handles = append(handles, handle)
	}
	return handles
}
