package socks5

const (
	AuthNoAuthRequired = 0x00
	AuthPassword       = 0x02
	AuthNoAcceptable   = 0xFF
)

const (
	PasswordAuthSuccess = 0x00
	PasswordAuthFailure = 0x01
)

type CredentialStore interface {
	Valid(username, password string) bool
}

type StaticCredentials map[string]string

func (s StaticCredentials) Valid(username, password string) bool {
	if pass, ok := s[username]; ok {
		return pass == password
	}
	return false
}

type Authenticator interface {
	Methods() []byte
	Authenticate(conn *Conn) (bool, error)
}

type NoAuthAuthenticator struct{}

func (a NoAuthAuthenticator) Methods() []byte {
	return []byte{AuthNoAuthRequired}
}

func (a NoAuthAuthenticator) Authenticate(conn *Conn) (bool, error) {
	return true, nil
}

type PasswordAuthenticator struct {
	Credentials CredentialStore
}

func (a PasswordAuthenticator) Methods() []byte {
	return []byte{AuthPassword}
}

func (a PasswordAuthenticator) Authenticate(conn *Conn) (bool, error) {
	buf := make([]byte, 2)
	if _, err := conn.ReadBuf(buf); err != nil {
		return false, err
	}
	version := buf[0]
	usernameLen := buf[1]
	if version != 1 {
		conn.Write([]byte{1, PasswordAuthFailure})
		return false, nil
	}
	usernameBuf := make([]byte, usernameLen)
	if _, err := conn.ReadBuf(usernameBuf); err != nil {
		return false, err
	}
	username := string(usernameBuf)
	passLenBuf := make([]byte, 1)
	if _, err := conn.ReadBuf(passLenBuf); err != nil {
		return false, err
	}
	passwordBuf := make([]byte, passLenBuf[0])
	if _, err := conn.ReadBuf(passwordBuf); err != nil {
		return false, err
	}
	password := string(passwordBuf)
	if a.Credentials.Valid(username, password) {
		conn.Write([]byte{Socks5Version, PasswordAuthSuccess})
		conn.Username = username
		return true, nil
	}
	conn.Write([]byte{Socks5Version, PasswordAuthFailure})
	return false, nil
}
