package database

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"coap-gateway/internal/models"

	"github.com/google/uuid"
	_ "github.com/mattn/go-sqlite3"
)

type Database struct {
	db *sql.DB
}

func New(path string) (*Database, error) {
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		return nil, fmt.Errorf("open database failed: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping database failed: %w", err)
	}

	database := &Database{db: db}
	if err := database.init(); err != nil {
		return nil, fmt.Errorf("init database failed: %w", err)
	}

	return database, nil
}

func (d *Database) init() error {
	schema := `
	CREATE TABLE IF NOT EXISTS devices (
		id TEXT PRIMARY KEY,
		device_id TEXT UNIQUE NOT NULL,
		name TEXT NOT NULL,
		type TEXT,
		status TEXT DEFAULT 'offline',
		last_seen DATETIME,
		remote_addr TEXT,
		protocol TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS routes (
		id TEXT PRIMARY KEY,
		device_id TEXT NOT NULL,
		coap_path TEXT NOT NULL,
		http_path TEXT NOT NULL,
		method TEXT NOT NULL DEFAULT 'GET',
		description TEXT,
		is_observable BOOLEAN DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(device_id, coap_path, method),
		FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS observe_subscriptions (
		id TEXT PRIMARY KEY,
		route_id TEXT NOT NULL,
		device_id TEXT NOT NULL,
		coap_path TEXT NOT NULL,
		token TEXT NOT NULL,
		sequence_number INTEGER DEFAULT 0,
		status TEXT DEFAULT 'active',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		last_notify_at DATETIME,
		expires_at DATETIME,
		FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
		FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_routes_device ON routes(device_id);
	CREATE INDEX IF NOT EXISTS idx_routes_http_path ON routes(http_path);
	CREATE INDEX IF NOT EXISTS idx_subscriptions_device ON observe_subscriptions(device_id);
	CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON observe_subscriptions(status);
	`

	_, err := d.db.Exec(schema)
	return err
}

func (d *Database) Close() error {
	return d.db.Close()
}

func (d *Database) CreateDevice(device *models.Device) error {
	if device.ID == "" {
		device.ID = uuid.New().String()
	}
	now := time.Now()
	device.CreatedAt = now
	device.UpdatedAt = now

	query := `INSERT INTO devices (id, device_id, name, type, status, last_seen, remote_addr, protocol, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err := d.db.Exec(query, device.ID, device.DeviceID, device.Name, device.Type, device.Status,
		device.LastSeen, device.RemoteAddr, device.Protocol, device.CreatedAt, device.UpdatedAt)
	return err
}

func (d *Database) GetDevice(deviceID string) (*models.Device, error) {
	query := `SELECT id, device_id, name, type, status, last_seen, remote_addr, protocol, created_at, updated_at
		FROM devices WHERE device_id = ?`

	var device models.Device
	err := d.db.QueryRow(query, deviceID).Scan(&device.ID, &device.DeviceID, &device.Name, &device.Type,
		&device.Status, &device.LastSeen, &device.RemoteAddr, &device.Protocol, &device.CreatedAt, &device.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &device, nil
}

func (d *Database) UpdateDeviceStatus(deviceID, status, remoteAddr string) error {
	query := `UPDATE devices SET status = ?, last_seen = ?, remote_addr = ?, updated_at = ? WHERE device_id = ?`
	now := time.Now()
	_, err := d.db.Exec(query, status, now, remoteAddr, now, deviceID)
	return err
}

func (d *Database) ListDevices() ([]*models.Device, error) {
	query := `SELECT id, device_id, name, type, status, last_seen, remote_addr, protocol, created_at, updated_at FROM devices ORDER BY created_at DESC`

	rows, err := d.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var devices []*models.Device
	for rows.Next() {
		var device models.Device
		err := rows.Scan(&device.ID, &device.DeviceID, &device.Name, &device.Type,
			&device.Status, &device.LastSeen, &device.RemoteAddr, &device.Protocol, &device.CreatedAt, &device.UpdatedAt)
		if err != nil {
			return nil, err
		}
		devices = append(devices, &device)
	}
	return devices, nil
}

func (d *Database) CreateRoute(route *models.Route) error {
	if route.ID == "" {
		route.ID = uuid.New().String()
	}
	now := time.Now()
	route.CreatedAt = now
	route.UpdatedAt = now

	query := `INSERT INTO routes (id, device_id, coap_path, http_path, method, description, is_observable, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err := d.db.Exec(query, route.ID, route.DeviceID, route.CoAPPath, route.HTTPPath,
		route.Method, route.Description, route.IsObservable, route.CreatedAt, route.UpdatedAt)
	return err
}

func (d *Database) GetRoute(id string) (*models.Route, error) {
	query := `SELECT id, device_id, coap_path, http_path, method, description, is_observable, created_at, updated_at
		FROM routes WHERE id = ?`

	var route models.Route
	err := d.db.QueryRow(query, id).Scan(&route.ID, &route.DeviceID, &route.CoAPPath, &route.HTTPPath,
		&route.Method, &route.Description, &route.IsObservable, &route.CreatedAt, &route.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &route, nil
}

func (d *Database) GetRouteByHTTPPath(httpPath, method string) (*models.Route, error) {
	query := `SELECT id, device_id, coap_path, http_path, method, description, is_observable, created_at, updated_at
		FROM routes WHERE http_path = ? AND method = ?`

	var route models.Route
	err := d.db.QueryRow(query, httpPath, method).Scan(&route.ID, &route.DeviceID, &route.CoAPPath, &route.HTTPPath,
		&route.Method, &route.Description, &route.IsObservable, &route.CreatedAt, &route.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &route, nil
}

func (d *Database) GetRoutesByDevice(deviceID string) ([]*models.Route, error) {
	query := `SELECT id, device_id, coap_path, http_path, method, description, is_observable, created_at, updated_at
		FROM routes WHERE device_id = ? ORDER BY created_at DESC`

	rows, err := d.db.Query(query, deviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var routes []*models.Route
	for rows.Next() {
		var route models.Route
		err := rows.Scan(&route.ID, &route.DeviceID, &route.CoAPPath, &route.HTTPPath,
			&route.Method, &route.Description, &route.IsObservable, &route.CreatedAt, &route.UpdatedAt)
		if err != nil {
			return nil, err
		}
		routes = append(routes, &route)
	}
	return routes, nil
}

func (d *Database) ListRoutes() ([]*models.Route, error) {
	query := `SELECT id, device_id, coap_path, http_path, method, description, is_observable, created_at, updated_at FROM routes ORDER BY created_at DESC`

	rows, err := d.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var routes []*models.Route
	for rows.Next() {
		var route models.Route
		err := rows.Scan(&route.ID, &route.DeviceID, &route.CoAPPath, &route.HTTPPath,
			&route.Method, &route.Description, &route.IsObservable, &route.CreatedAt, &route.UpdatedAt)
		if err != nil {
			return nil, err
		}
		routes = append(routes, &route)
	}
	return routes, nil
}

func (d *Database) DeleteRoute(id string) error {
	query := `DELETE FROM routes WHERE id = ?`
	_, err := d.db.Exec(query, id)
	return err
}

func (d *Database) UpdateDevice(deviceID string, updates map[string]interface{}) error {
	if len(updates) == 0 {
		return nil
	}

	setClauses := make([]string, 0, len(updates))
	args := make([]interface{}, 0, len(updates)+1)

	for key, value := range updates {
		setClauses = append(setClauses, fmt.Sprintf("%s = ?", key))
		args = append(args, value)
	}
	setClauses = append(setClauses, "updated_at = ?")
	args = append(args, time.Now())
	args = append(args, deviceID)

	query := fmt.Sprintf("UPDATE devices SET %s WHERE device_id = ?", strings.Join(setClauses, ", "))
	_, err := d.db.Exec(query, args...)
	return err
}

func (d *Database) DeleteDevice(deviceID string) error {
	query := `DELETE FROM devices WHERE device_id = ?`
	_, err := d.db.Exec(query, deviceID)
	return err
}

func (d *Database) UpdateRoute(id string, updates map[string]interface{}) error {
	if len(updates) == 0 {
		return nil
	}

	setClauses := make([]string, 0, len(updates))
	args := make([]interface{}, 0, len(updates)+1)

	for key, value := range updates {
		setClauses = append(setClauses, fmt.Sprintf("%s = ?", key))
		args = append(args, value)
	}
	setClauses = append(setClauses, "updated_at = ?")
	args = append(args, time.Now())
	args = append(args, id)

	query := fmt.Sprintf("UPDATE routes SET %s WHERE id = ?", strings.Join(setClauses, ", "))
	_, err := d.db.Exec(query, args...)
	return err
}

func (d *Database) CreateSubscription(sub *models.ObserveSubscription) error {
	if sub.ID == "" {
		sub.ID = uuid.New().String()
	}
	now := time.Now()
	sub.CreatedAt = now
	sub.Status = "active"

	query := `INSERT INTO observe_subscriptions (id, route_id, device_id, coap_path, token, sequence_number, status, created_at, last_notify_at, expires_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err := d.db.Exec(query, sub.ID, sub.RouteID, sub.DeviceID, sub.CoAPPath, sub.Token,
		sub.SequenceNumber, sub.Status, sub.CreatedAt, sub.LastNotifyAt, sub.ExpiresAt)
	return err
}

func (d *Database) UpdateSubscriptionSequence(id string, seq uint32) error {
	query := `UPDATE observe_subscriptions SET sequence_number = ?, last_notify_at = ? WHERE id = ?`
	now := time.Now()
	_, err := d.db.Exec(query, seq, now, id)
	return err
}

func (d *Database) CancelSubscription(id string) error {
	query := `UPDATE observe_subscriptions SET status = 'cancelled', updated_at = ? WHERE id = ?`
	now := time.Now()
	_, err := d.db.Exec(query, now, id)
	return err
}

func (d *Database) GetActiveSubscriptions() ([]*models.ObserveSubscription, error) {
	query := `SELECT id, route_id, device_id, coap_path, token, sequence_number, status, created_at, last_notify_at, expires_at
		FROM observe_subscriptions WHERE status = 'active'`

	rows, err := d.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subs []*models.ObserveSubscription
	for rows.Next() {
		var sub models.ObserveSubscription
		err := rows.Scan(&sub.ID, &sub.RouteID, &sub.DeviceID, &sub.CoAPPath, &sub.Token,
			&sub.SequenceNumber, &sub.Status, &sub.CreatedAt, &sub.LastNotifyAt, &sub.ExpiresAt)
		if err != nil {
			return nil, err
		}
		subs = append(subs, &sub)
	}
	return subs, nil
}

func (d *Database) GetSubscriptionByToken(token string) (*models.ObserveSubscription, error) {
	query := `SELECT id, route_id, device_id, coap_path, token, sequence_number, status, created_at, last_notify_at, expires_at
		FROM observe_subscriptions WHERE token = ? AND status = 'active'`

	var sub models.ObserveSubscription
	err := d.db.QueryRow(query, token).Scan(&sub.ID, &sub.RouteID, &sub.DeviceID, &sub.CoAPPath, &sub.Token,
		&sub.SequenceNumber, &sub.Status, &sub.CreatedAt, &sub.LastNotifyAt, &sub.ExpiresAt)
	if err != nil {
		return nil, err
	}
	return &sub, nil
}
