package service

import (
	"crypto/rand"
	"encoding/binary"
	"regexp"
	"sort"
	"strings"
	"tacacs-simulator/model"
	"tacacs-simulator/protocol"
	"tacacs-simulator/repository"
)

type TacacsService struct {
	repo *repository.Repository
}

func NewTacacsService(repo *repository.Repository) *TacacsService {
	return &TacacsService{repo: repo}
}

func (s *TacacsService) generateSessionID() uint32 {
	b := make([]byte, 4)
	rand.Read(b)
	return binary.BigEndian.Uint32(b)
}

func (s *TacacsService) Authenticate(username, password string) (*model.AuthResponse, error) {
	sessionID := s.generateSessionID()
	secret := s.repo.GetSharedSecret()
	crypto := protocol.NewTacacsCrypto(secret)

	authStart := &protocol.AuthStart{
		Action:     model.TacacsAuthActionLogin,
		PrivLvl:    1,
		AuthenType: model.TacacsAuthTypeASCII,
		AuthenSvc:  model.TacacsAuthSvcLogin,
		User:       username,
		Port:       "console",
		RemAddr:    "127.0.0.1",
		Data:       password,
	}

	reqBody, err := protocol.EncodeAuthStart(authStart)
	if err != nil {
		return nil, err
	}

	reqHeader := &protocol.TacacsHeader{
		Version:   protocol.MakeVersion(model.TacacsVersionMajor, model.TacacsVersionMinor),
		Type:      model.TacacsTypeAuth,
		SeqNo:     1,
		Flags:     model.TacacsFlagEncrypted,
		SessionID: sessionID,
		Length:    uint32(len(reqBody)),
	}

	encReqBody := crypto.Encrypt(reqHeader, reqBody)
	reqPacket := append([]byte{}, must(protocol.EncodeHeader(reqHeader))...)
	reqPacket = append(reqPacket, encReqBody...)

	var status uint8
	var serverMsg string
	user, exists := s.repo.GetUser(username)
	if !exists {
		status = model.TacacsAuthStatusFail
		serverMsg = "Authentication failed: user not found"
	} else if user.Password != password {
		status = model.TacacsAuthStatusFail
		serverMsg = "Authentication failed: invalid password"
	} else {
		status = model.TacacsAuthStatusPass
		serverMsg = "Authentication successful"
		s.repo.CreateSession(sessionID, username)
	}

	authReply := &protocol.AuthReply{
		Status:    status,
		Flags:     0,
		ServerMsg: serverMsg,
		Data:      "",
	}

	respBody, err := protocol.EncodeAuthReply(authReply)
	if err != nil {
		return nil, err
	}

	respHeader := &protocol.TacacsHeader{
		Version:   protocol.MakeVersion(model.TacacsVersionMajor, model.TacacsVersionMinor),
		Type:      model.TacacsTypeAuth,
		SeqNo:     2,
		Flags:     model.TacacsFlagEncrypted,
		SessionID: sessionID,
		Length:    uint32(len(respBody)),
	}

	encRespBody := crypto.Encrypt(respHeader, respBody)
	respPacket := append([]byte{}, must(protocol.EncodeHeader(respHeader))...)
	respPacket = append(respPacket, encRespBody...)

	decReqBody := crypto.Decrypt(reqHeader, encReqBody)
	decRespBody := crypto.Decrypt(respHeader, encRespBody)

	reqFields := reqHeader.ToMap()
	reqBodyFields := authStart.ToMap()
	for k, v := range reqBodyFields {
		reqFields[k] = v
	}

	respFields := respHeader.ToMap()
	respBodyFields := authReply.ToMap()
	for k, v := range respBodyFields {
		respFields[k] = v
	}

	s.repo.RecordPacket(&model.PacketRecord{
		SessionID:    sessionID,
		Type:         "auth",
		Direction:    "request",
		RawHex:       protocol.BytesToHex(reqPacket),
		DecryptedBody: protocol.BytesToHex(decReqBody),
		HeaderFields: reqHeader.ToMap(),
		BodyFields:   authStart.ToMap(),
	})

	s.repo.RecordPacket(&model.PacketRecord{
		SessionID:    sessionID,
		Type:         "auth",
		Direction:    "response",
		RawHex:       protocol.BytesToHex(respPacket),
		DecryptedBody: protocol.BytesToHex(decRespBody),
		HeaderFields: respHeader.ToMap(),
		BodyFields:   authReply.ToMap(),
	})

	return &model.AuthResponse{
		Success:   status == model.TacacsAuthStatusPass,
		Message:   serverMsg,
		SessionID: sessionID,
		Request: model.PacketDetail{
			Header:       reqHeader.ToInfo(),
			RawHex:       protocol.BytesToHex(reqPacket),
			DecryptedHex: protocol.BytesToHex(decReqBody),
			Fields:       reqFields,
		},
		Response: model.PacketDetail{
			Header:       respHeader.ToInfo(),
			RawHex:       protocol.BytesToHex(respPacket),
			DecryptedHex: protocol.BytesToHex(decRespBody),
			Fields:       respFields,
		},
	}, nil
}

func (s *TacacsService) Authorize(username, command string, cmdArgs []string, attrs map[string]string, sessionID uint32) (*model.AuthorizeResponse, error) {
	secret := s.repo.GetSharedSecret()
	crypto := protocol.NewTacacsCrypto(secret)

	_, sessionExists := s.repo.GetSession(sessionID)
	if !sessionExists {
		sessionID = s.generateSessionID()
		s.repo.CreateSession(sessionID, username)
	}

	user, userExists := s.repo.GetUser(username)
	userPrivLvl := uint8(1)
	if userExists {
		userPrivLvl = uint8(user.PrivilegeLevel)
	}

	args := []string{"cmd=" + command}
	for _, arg := range cmdArgs {
		args = append(args, "cmd-arg="+arg)
	}
	if len(cmdArgs) == 0 {
		args = append(args, "cmd-arg=")
	}
	for k, v := range attrs {
		args = append(args, k+"="+v)
	}

	authReq := &protocol.AuthorRequest{
		AuthenMethod: 1,
		PrivLvl:      userPrivLvl,
		AuthenType:   model.TacacsAuthTypeASCII,
		AuthenSvc:    model.TacacsAuthSvcLogin,
		User:         username,
		Port:         "console",
		RemAddr:      "127.0.0.1",
		Args:         args,
	}

	reqBody, err := protocol.EncodeAuthorRequest(authReq)
	if err != nil {
		return nil, err
	}

	reqHeader := &protocol.TacacsHeader{
		Version:   protocol.MakeVersion(model.TacacsVersionMajor, model.TacacsVersionMinor),
		Type:      model.TacacsTypeAuthorize,
		SeqNo:     1,
		Flags:     model.TacacsFlagEncrypted,
		SessionID: sessionID,
		Length:    uint32(len(reqBody)),
	}

	encReqBody := crypto.Encrypt(reqHeader, reqBody)
	reqPacket := append([]byte{}, must(protocol.EncodeHeader(reqHeader))...)
	reqPacket = append(reqPacket, encReqBody...)

	policies := s.repo.GetPoliciesForUser(username)
	sort.Slice(policies, func(i, j int) bool {
		return policies[i].Priority > policies[j].Priority
	})

	var matchedPolicy *model.AuthPolicy
	for _, p := range policies {
		cmdMatched, _ := regexp.MatchString(p.CommandPattern, command)
		if !cmdMatched {
			continue
		}

		argsMatched := true
		if len(p.ArgPatterns) > 0 {
			argsMatched = false
			for _, argPattern := range p.ArgPatterns {
				for _, arg := range cmdArgs {
					if argMatched, _ := regexp.MatchString(argPattern, arg); argMatched {
						argsMatched = true
						break
					}
				}
			}
		}

		if argsMatched {
			matchedPolicy = p
			break
		}
	}

	var status uint8
	var serverMsg string
	matchedPattern := ""
	var returnAttrs map[string]string
	var replyArgs []string

	if matchedPolicy != nil {
		matchedPattern = matchedPolicy.CommandPattern
		if len(matchedPolicy.ArgPatterns) > 0 {
			matchedPattern = matchedPattern + " (args: " + strings.Join(matchedPolicy.ArgPatterns, ", ") + ")"
		}

		if matchedPolicy.Allowed {
			status = model.TacacsAuthorStatusPassAdd
			serverMsg = "Authorization successful"
			returnAttrs = matchedPolicy.ReturnAttrs
			if returnAttrs != nil {
				for k, v := range returnAttrs {
					replyArgs = append(replyArgs, k+"="+v)
				}
			}
		} else {
			status = model.TacacsAuthorStatusFail
			serverMsg = "Authorization denied by policy"
		}
	} else {
		status = model.TacacsAuthorStatusFail
		serverMsg = "Authorization denied: no matching policy"
	}

	authReply := &protocol.AuthorReply{
		Status:    status,
		ServerMsg: serverMsg,
		Data:      "",
		Args:      replyArgs,
	}

	respBody, err := protocol.EncodeAuthorReply(authReply)
	if err != nil {
		return nil, err
	}

	respHeader := &protocol.TacacsHeader{
		Version:   protocol.MakeVersion(model.TacacsVersionMajor, model.TacacsVersionMinor),
		Type:      model.TacacsTypeAuthorize,
		SeqNo:     2,
		Flags:     model.TacacsFlagEncrypted,
		SessionID: sessionID,
		Length:    uint32(len(respBody)),
	}

	encRespBody := crypto.Encrypt(respHeader, respBody)
	respPacket := append([]byte{}, must(protocol.EncodeHeader(respHeader))...)
	respPacket = append(respPacket, encRespBody...)

	decReqBody := crypto.Decrypt(reqHeader, encReqBody)
	decRespBody := crypto.Decrypt(respHeader, encRespBody)

	reqFields := reqHeader.ToMap()
	reqBodyFields := authReq.ToMap()
	for k, v := range reqBodyFields {
		reqFields[k] = v
	}

	respFields := respHeader.ToMap()
	respBodyFields := authReply.ToMap()
	for k, v := range respBodyFields {
		respFields[k] = v
	}

	s.repo.RecordPacket(&model.PacketRecord{
		SessionID:     sessionID,
		Type:          "authorize",
		Direction:     "request",
		RawHex:        protocol.BytesToHex(reqPacket),
		DecryptedBody: protocol.BytesToHex(decReqBody),
		HeaderFields:  reqHeader.ToMap(),
		BodyFields:    authReq.ToMap(),
	})

	s.repo.RecordPacket(&model.PacketRecord{
		SessionID:     sessionID,
		Type:          "authorize",
		Direction:     "response",
		RawHex:        protocol.BytesToHex(respPacket),
		DecryptedBody: protocol.BytesToHex(decRespBody),
		HeaderFields:  respHeader.ToMap(),
		BodyFields:    authReply.ToMap(),
	})

	return &model.AuthorizeResponse{
		Allowed:       status == model.TacacsAuthorStatusPassAdd || status == model.TacacsAuthorStatusPassReplace,
		Reason:        serverMsg,
		MatchedPolicy: matchedPattern,
		ReturnAttrs:   returnAttrs,
		Request: model.PacketDetail{
			Header:       reqHeader.ToInfo(),
			RawHex:       protocol.BytesToHex(reqPacket),
			DecryptedHex: protocol.BytesToHex(decReqBody),
			Fields:       reqFields,
		},
		Response: model.PacketDetail{
			Header:       respHeader.ToInfo(),
			RawHex:       protocol.BytesToHex(respPacket),
			DecryptedHex: protocol.BytesToHex(decRespBody),
			Fields:       respFields,
		},
	}, nil
}

func (s *TacacsService) Accounting(req *model.AccountingRequest) (*model.AccountingResponse, error) {
	secret := s.repo.GetSharedSecret()
	crypto := protocol.NewTacacsCrypto(secret)
	sessionID := req.SessionID
	if sessionID == 0 {
		sessionID = s.generateSessionID()
	}

	var seqNo uint8
	if req.SeqNo > 0 {
		if !s.repo.ValidateAndSetAcctSeqNo(sessionID, req.SeqNo) {
			return &model.AccountingResponse{
				Success: false,
				Message: "Accounting failed: invalid or duplicate sequence number (replay detected)",
				SeqNo:   req.SeqNo,
			}, nil
		}
		seqNo = req.SeqNo
	} else {
		seqNo = s.repo.GetNextAcctSeqNo(sessionID)
	}

	flags := uint8(0)
	if req.Status == "start" {
		flags = model.TacacsAcctFlagStart
	} else if req.Status == "stop" {
		flags = model.TacacsAcctFlagStop
	} else if req.Status == "update" {
		flags = model.TacacsAcctFlagUpdate
	}

	user, userExists := s.repo.GetUser(req.Username)
	userPrivLvl := uint8(1)
	if userExists {
		userPrivLvl = uint8(user.PrivilegeLevel)
	}

	args := make([]string, 0)
	if req.Command != "" {
		args = append(args, "cmd="+req.Command)
	}
	for k, v := range req.Args {
		args = append(args, k+"="+v)
	}

	acctReq := &protocol.AcctRequest{
		Flags:        flags,
		AuthenMethod: 1,
		PrivLvl:      userPrivLvl,
		AuthenType:   model.TacacsAuthTypeASCII,
		AuthenSvc:    model.TacacsAuthSvcLogin,
		User:         req.Username,
		Port:         "console",
		RemAddr:      "127.0.0.1",
		Args:         args,
	}

	reqBody, err := protocol.EncodeAcctRequest(acctReq)
	if err != nil {
		return nil, err
	}

	reqHeader := &protocol.TacacsHeader{
		Version:   protocol.MakeVersion(model.TacacsVersionMajor, model.TacacsVersionMinor),
		Type:      model.TacacsTypeAccounting,
		SeqNo:     seqNo,
		Flags:     model.TacacsFlagEncrypted,
		SessionID: sessionID,
		Length:    uint32(len(reqBody)),
	}

	encReqBody := crypto.Encrypt(reqHeader, reqBody)
	reqPacket := append([]byte{}, must(protocol.EncodeHeader(reqHeader))...)
	reqPacket = append(reqPacket, encReqBody...)

	acctReply := &protocol.AcctReply{
		Status: 1,
		Flags:  0,
	}

	respBody, err := protocol.EncodeAcctReply(acctReply)
	if err != nil {
		return nil, err
	}

	respHeader := &protocol.TacacsHeader{
		Version:   protocol.MakeVersion(model.TacacsVersionMajor, model.TacacsVersionMinor),
		Type:      model.TacacsTypeAccounting,
		SeqNo:     seqNo + 1,
		Flags:     model.TacacsFlagEncrypted,
		SessionID: sessionID,
		Length:    uint32(len(respBody)),
	}

	encRespBody := crypto.Encrypt(respHeader, respBody)
	respPacket := append([]byte{}, must(protocol.EncodeHeader(respHeader))...)
	respPacket = append(respPacket, encRespBody...)

	decReqBody := crypto.Decrypt(reqHeader, encReqBody)
	decRespBody := crypto.Decrypt(respHeader, encRespBody)

	reqFields := reqHeader.ToMap()
	reqBodyFields := acctReq.ToMap()
	for k, v := range reqBodyFields {
		reqFields[k] = v
	}

	respFields := respHeader.ToMap()
	respBodyFields := acctReply.ToMap()
	for k, v := range respBodyFields {
		respFields[k] = v
	}

	s.repo.RecordPacket(&model.PacketRecord{
		SessionID:     sessionID,
		Type:          "accounting",
		Direction:     "request",
		RawHex:        protocol.BytesToHex(reqPacket),
		DecryptedBody: protocol.BytesToHex(decReqBody),
		HeaderFields:  reqHeader.ToMap(),
		BodyFields:    acctReq.ToMap(),
	})

	s.repo.RecordPacket(&model.PacketRecord{
		SessionID:     sessionID,
		Type:          "accounting",
		Direction:     "response",
		RawHex:        protocol.BytesToHex(respPacket),
		DecryptedBody: protocol.BytesToHex(decRespBody),
		HeaderFields:  respHeader.ToMap(),
		BodyFields:    acctReply.ToMap(),
	})

	return &model.AccountingResponse{
		Success: true,
		Message: "Accounting record received",
		SeqNo:   seqNo,
		Request: model.PacketDetail{
			Header:       reqHeader.ToInfo(),
			RawHex:       protocol.BytesToHex(reqPacket),
			DecryptedHex: protocol.BytesToHex(decReqBody),
			Fields:       reqFields,
		},
		Response: model.PacketDetail{
			Header:       respHeader.ToInfo(),
			RawHex:       protocol.BytesToHex(respPacket),
			DecryptedHex: protocol.BytesToHex(decRespBody),
			Fields:       respFields,
		},
	}, nil
}

func must(b []byte, err error) []byte {
	if err != nil {
		panic(err)
	}
	return b
}
