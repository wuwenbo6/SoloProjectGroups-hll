package user

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Token     string    `json:"token"`
	Password  string    `json:"password,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Store struct {
	path string
	mu   sync.RWMutex
}

var (
	ErrUserExists   = errors.New("user already exists")
	ErrUserNotFound = errors.New("user not found")
)

func NewStore(path string) (*Store, error) {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	if _, err := os.Stat(path); os.IsNotExist(err) {
		if err := os.WriteFile(path, []byte("[]"), 0644); err != nil {
			return nil, err
		}
	}

	return &Store{path: path}, nil
}

func (s *Store) load() ([]User, error) {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return nil, err
	}

	var users []User
	if err := json.Unmarshal(data, &users); err != nil {
		return nil, err
	}

	return users, nil
}

func (s *Store) save(users []User) error {
	data, err := json.MarshalIndent(users, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.path, data, 0644)
}

func (s *Store) Create(username, password string) (*User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	users, err := s.load()
	if err != nil {
		return nil, err
	}

	for _, u := range users {
		if u.Username == username {
			return nil, ErrUserExists
		}
	}

	now := time.Now()
	user := &User{
		ID:        uuid.New().String(),
		Username:  username,
		Token:     uuid.New().String(),
		Password:  password,
		CreatedAt: now,
		UpdatedAt: now,
	}

	users = append(users, *user)
	if err := s.save(users); err != nil {
		return nil, err
	}

	return user, nil
}

func (s *Store) GetByID(id string) (*User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	users, err := s.load()
	if err != nil {
		return nil, err
	}

	for _, u := range users {
		if u.ID == id {
			return &u, nil
		}
	}

	return nil, ErrUserNotFound
}

func (s *Store) GetByUsername(username string) (*User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	users, err := s.load()
	if err != nil {
		return nil, err
	}

	for _, u := range users {
		if u.Username == username {
			return &u, nil
		}
	}

	return nil, ErrUserNotFound
}

func (s *Store) GetByToken(token string) (*User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	users, err := s.load()
	if err != nil {
		return nil, err
	}

	for _, u := range users {
		if u.Token == token {
			return &u, nil
		}
	}

	return nil, ErrUserNotFound
}

func (s *Store) List() ([]User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.load()
}

func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	users, err := s.load()
	if err != nil {
		return err
	}

	var found bool
	var newUsers []User
	for _, u := range users {
		if u.ID == id {
			found = true
			continue
		}
		newUsers = append(newUsers, u)
	}

	if !found {
		return ErrUserNotFound
	}

	return s.save(newUsers)
}

func (s *Store) Update(id, username, password string) (*User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	users, err := s.load()
	if err != nil {
		return nil, err
	}

	var found bool
	var updatedUser *User
	for i, u := range users {
		if u.ID == id {
			found = true
			if username != "" {
				users[i].Username = username
			}
			if password != "" {
				users[i].Password = password
			}
			users[i].Token = uuid.New().String()
			users[i].UpdatedAt = time.Now()
			updatedUser = &users[i]
			break
		}
	}

	if !found {
		return nil, ErrUserNotFound
	}

	if err := s.save(users); err != nil {
		return nil, err
	}

	return updatedUser, nil
}
