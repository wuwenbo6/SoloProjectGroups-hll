package modbus

import (
	"errors"
	"sync"
)

var (
	ErrRouteNotFound = errors.New("route not found")
	ErrIPExists      = errors.New("IP address already exists")
)

type Router struct {
	mu      sync.RWMutex
	routes  map[int]*Route
	ipIndex map[string]int
	nextID  int
}

func NewRouter() *Router {
	return &Router{
		routes:  make(map[int]*Route),
		ipIndex: make(map[string]int),
		nextID:  1,
	}
}

func (r *Router) Add(route *Route) (*Route, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.ipIndex[route.IPAddress]; exists {
		return nil, ErrIPExists
	}
	route.ID = r.nextID
	r.nextID++
	r.routes[route.ID] = route
	r.ipIndex[route.IPAddress] = route.ID
	return route, nil
}

func (r *Router) Update(id int, route *Route) (*Route, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	existing, ok := r.routes[id]
	if !ok {
		return nil, ErrRouteNotFound
	}
	if existing.IPAddress != route.IPAddress {
		if _, exists := r.ipIndex[route.IPAddress]; exists {
			return nil, ErrIPExists
		}
		delete(r.ipIndex, existing.IPAddress)
		r.ipIndex[route.IPAddress] = id
	}
	route.ID = id
	r.routes[id] = route
	return route, nil
}

func (r *Router) Delete(id int) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	route, ok := r.routes[id]
	if !ok {
		return ErrRouteNotFound
	}
	delete(r.ipIndex, route.IPAddress)
	delete(r.routes, id)
	return nil
}

func (r *Router) Get(id int) (*Route, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	route, ok := r.routes[id]
	return route, ok
}

func (r *Router) GetByIP(ip string) (*Route, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	id, ok := r.ipIndex[ip]
	if !ok {
		return nil, false
	}
	return r.routes[id], true
}

func (r *Router) GetAll() []*Route {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]*Route, 0, len(r.routes))
	for _, route := range r.routes {
		result = append(result, route)
	}
	return result
}

func (r *Router) ToggleEnabled(id int, enabled bool) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	route, ok := r.routes[id]
	if !ok {
		return ErrRouteNotFound
	}
	route.Enabled = enabled
	return nil
}
