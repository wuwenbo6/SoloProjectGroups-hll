package auth

import (
	"crypto/md5"
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"sync"
	"time"
)

type AuthMethod string

const (
	MethodPAP  AuthMethod = "PAP"
	MethodCHAP AuthMethod = "CHAP"

	CHAPChallengeLength = 16
	CHAPResponseLength  = 16

	CHAPCodeChallenge = 1
	CHAPCodeResponse  = 2
	CHAPCodeSuccess   = 3
	CHAPCodeFailure   = 4
)

type CHAPChallenge struct {
	Code       uint8
	Identifier uint8
	Length     uint16
	ValueSize  uint8
	Value      []byte
	Name       string
}

type CHAPResponse struct {
	Code       uint8
	Identifier uint8
	Length     uint16
	ValueSize  uint8
	Value      []byte
	Name       string
}

type AuthResult struct {
	Success   bool       `json:"success"`
	Username  string     `json:"username"`
	Method    AuthMethod `json:"method"`
	SessionID string     `json:"session_id"`
	RemoteIP  string     `json:"remote_ip,omitempty"`
	Message   string     `json:"message"`
	Timestamp time.Time  `json:"timestamp"`
	Duration  string     `json:"duration"`
}

type UserCredential struct {
	Username string
	Password string
	IPPool   string
	VLAN     int
}

type CredentialStore struct {
	mu          sync.RWMutex
	credentials map[string]*UserCredential
	ipPools     map[string]*IPPool
}

type IPPool struct {
	Name    string
	Start   string
	End     string
	current uint32
}

type IPRange struct {
	Start uint32
	End   uint32
}

func NewCredentialStore() *CredentialStore {
	store := &CredentialStore{
		credentials: make(map[string]*UserCredential),
		ipPools:     make(map[string]*IPPool),
	}

	store.AddCredential("user001", "password001", "pool-residential", 100)
	store.AddCredential("user002", "password002", "pool-residential", 101)
	store.AddCredential("user003", "password003", "pool-business", 200)
	store.AddCredential("admin", "admin123", "pool-management", 999)
	store.AddCredential("testuser", "test123", "pool-residential", 102)

	store.AddIPPool("pool-residential", "10.1.0.1", "10.1.255.254")
	store.AddIPPool("pool-business", "10.2.0.1", "10.2.255.254")
	store.AddIPPool("pool-management", "10.0.0.1", "10.0.0.254")

	return store
}

func (cs *CredentialStore) AddCredential(username, password, poolName string, defaultVLAN int) {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	cs.credentials[username] = &UserCredential{
		Username: username,
		Password: password,
		IPPool:   poolName,
		VLAN:     defaultVLAN,
	}
}

func (cs *CredentialStore) AddIPPool(name, start, end string) {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	cs.ipPools[name] = &IPPool{
		Name:    name,
		Start:   start,
		End:     end,
		current: ipToUint32(start),
	}
}

func (cs *CredentialStore) GetCredential(username string) (*UserCredential, bool) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	cred, ok := cs.credentials[username]
	if !ok {
		return nil, false
	}
	return &UserCredential{
		Username: cred.Username,
		Password: cred.Password,
		IPPool:   cred.IPPool,
		VLAN:     cred.VLAN,
	}, true
}

func (cs *CredentialStore) AllocateIP(poolName string) (string, error) {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	pool, ok := cs.ipPools[poolName]
	if !ok {
		return "", fmt.Errorf("IP pool '%s' not found", poolName)
	}

	endUint := ipToUint32(pool.End)
	if pool.current > endUint {
		pool.current = ipToUint32(pool.Start)
	}

	ip := uint32ToIP(pool.current)
	pool.current++
	return ip, nil
}

type Authenticator struct {
	store *CredentialStore
	mu    sync.RWMutex
}

func NewAuthenticator(store *CredentialStore) *Authenticator {
	return &Authenticator{
		store: store,
	}
}

func (a *Authenticator) GetStore() *CredentialStore {
	return a.store
}

func (a *Authenticator) AuthenticatePAP(sessionID, username, password string) *AuthResult {
	start := time.Now()
	result := &AuthResult{
		Method:    MethodPAP,
		Username:  username,
		SessionID: sessionID,
		Timestamp: time.Now(),
	}

	cred, ok := a.store.GetCredential(username)
	if !ok {
		result.Success = false
		result.Message = fmt.Sprintf("User '%s' not found", username)
		result.Duration = time.Since(start).String()
		return result
	}

	if cred.Password != password {
		result.Success = false
		result.Message = "Authentication failed: invalid password"
		result.Duration = time.Since(start).String()
		return result
	}

	ip, err := a.store.AllocateIP(cred.IPPool)
	if err != nil {
		result.Success = false
		result.Message = fmt.Sprintf("IP allocation failed: %v", err)
		result.Duration = time.Since(start).String()
		return result
	}

	result.Success = true
	result.RemoteIP = ip
	result.Message = fmt.Sprintf("PAP authentication successful for user '%s', assigned IP %s", username, ip)
	result.Duration = time.Since(start).String()
	return result
}

func (a *Authenticator) GenerateCHAPChallenge(acName string) *CHAPChallenge {
	value := make([]byte, CHAPChallengeLength)
	rand.Read(value)

	idByte := make([]byte, 1)
	rand.Read(idByte)
	identifier := uint8(idByte[0])

	challenge := &CHAPChallenge{
		Code:       CHAPCodeChallenge,
		Identifier: identifier,
		ValueSize:  CHAPChallengeLength,
		Value:      value,
		Name:       acName,
	}
	challenge.Length = uint16(4 + 1 + len(challenge.Value) + len(challenge.Name))
	return challenge
}

func (a *Authenticator) ComputeCHAPResponse(challenge *CHAPChallenge, username, password string) *CHAPResponse {
	response := &CHAPResponse{
		Code:       CHAPCodeResponse,
		Identifier: challenge.Identifier,
		ValueSize:  CHAPResponseLength,
		Name:       username,
	}
	response.Length = uint16(4 + 1 + CHAPResponseLength + len(username))

	input := make([]byte, 0, 1+len(password)+len(challenge.Value))
	input = append(input, challenge.Identifier)
	input = append(input, []byte(password)...)
	input = append(input, challenge.Value...)

	h := md5.New()
	h.Write(input)
	response.Value = h.Sum(nil)

	return response
}

func (a *Authenticator) VerifyCHAPResponse(challenge *CHAPChallenge, response *CHAPResponse, username, password string) bool {
	if response.Identifier != challenge.Identifier {
		return false
	}
	if response.ValueSize != CHAPResponseLength {
		return false
	}
	if response.Code != CHAPCodeResponse {
		return false
	}

	input := make([]byte, 0, 1+len(password)+len(challenge.Value))
	input = append(input, challenge.Identifier)
	input = append(input, []byte(password)...)
	input = append(input, challenge.Value...)

	h := md5.New()
	h.Write(input)
	expected := h.Sum(nil)

	if len(response.Value) != len(expected) {
		return false
	}

	for i := range response.Value {
		if response.Value[i] != expected[i] {
			return false
		}
	}

	return true
}

func (c *CHAPChallenge) Serialize() []byte {
	buf := make([]byte, c.Length)
	buf[0] = c.Code
	buf[1] = c.Identifier
	binary.BigEndian.PutUint16(buf[2:4], c.Length)
	buf[4] = c.ValueSize
	copy(buf[5:5+c.ValueSize], c.Value)
	copy(buf[5+c.ValueSize:], []byte(c.Name))
	return buf
}

func ParseCHAPChallenge(data []byte) (*CHAPChallenge, error) {
	if len(data) < 5 {
		return nil, fmt.Errorf("challenge data too short")
	}

	c := &CHAPChallenge{
		Code:       data[0],
		Identifier: data[1],
		Length:     binary.BigEndian.Uint16(data[2:4]),
		ValueSize:  data[4],
	}

	if c.Code != CHAPCodeChallenge {
		return nil, fmt.Errorf("invalid challenge code: %d", c.Code)
	}
	if len(data) < int(c.Length) {
		return nil, fmt.Errorf("incomplete challenge data")
	}

	c.Value = make([]byte, c.ValueSize)
	copy(c.Value, data[5:5+c.ValueSize])
	c.Name = string(data[5+c.ValueSize : c.Length])

	return c, nil
}

func (a *Authenticator) AuthenticateCHAP(sessionID, username string, challenge *CHAPChallenge, response *CHAPResponse) *AuthResult {
	start := time.Now()
	result := &AuthResult{
		Method:    MethodCHAP,
		Username:  username,
		SessionID: sessionID,
		Timestamp: time.Now(),
	}

	cred, ok := a.store.GetCredential(username)
	if !ok {
		result.Success = false
		result.Message = fmt.Sprintf("User '%s' not found", username)
		result.Duration = time.Since(start).String()
		return result
	}

	if !a.VerifyCHAPResponse(challenge, response, username, cred.Password) {
		result.Success = false
		result.Message = fmt.Sprintf("CHAP authentication failed: response mismatch (challenge=%02x, response=%08x, expected=%08x)",
			challenge.Identifier,
			response.Value[0:4],
			computeExpectedHash(challenge, cred.Password)[0:4])
		result.Duration = time.Since(start).String()
		return result
	}

	ip, err := a.store.AllocateIP(cred.IPPool)
	if err != nil {
		result.Success = false
		result.Message = fmt.Sprintf("IP allocation failed: %v", err)
		result.Duration = time.Since(start).String()
		return result
	}

	result.Success = true
	result.RemoteIP = ip
	result.Message = fmt.Sprintf("CHAP authentication successful: user='%s', challenge_id=%d, challenge_len=%d, response_len=%d, ip=%s",
		username, challenge.Identifier, len(challenge.Value), len(response.Value), ip)
	result.Duration = time.Since(start).String()
	return result
}

func computeExpectedHash(challenge *CHAPChallenge, password string) []byte {
	input := make([]byte, 0, 1+len(password)+len(challenge.Value))
	input = append(input, challenge.Identifier)
	input = append(input, []byte(password)...)
	input = append(input, challenge.Value...)
	h := md5.New()
	h.Write(input)
	return h.Sum(nil)
}

func computeCHAPResponse(challenge []byte, secret string) []byte {
	h := md5.New()
	h.Write(challenge)
	h.Write([]byte(secret))
	return h.Sum(nil)
}

func ipToUint32(ip string) uint32 {
	var a, b, c, d uint32
	fmt.Sscanf(ip, "%d.%d.%d.%d", &a, &b, &c, &d)
	return (a << 24) | (b << 16) | (c << 8) | d
}

func uint32ToIP(n uint32) string {
	return fmt.Sprintf("%d.%d.%d.%d",
		(n>>24)&0xFF,
		(n>>16)&0xFF,
		(n>>8)&0xFF,
		n&0xFF)
}
