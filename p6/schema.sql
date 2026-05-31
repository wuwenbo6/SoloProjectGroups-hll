CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS sensors (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(200),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sensor_data (
    id BIGSERIAL,
    sensor_id VARCHAR(50) REFERENCES sensors(id),
    timestamp TIMESTAMPTZ NOT NULL,
    peak_current DOUBLE PRECISION NOT NULL,
    pulse_count INTEGER NOT NULL,
    waveform_data DOUBLE PRECISION[],
    pollution_level INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

SELECT create_hypertable('sensor_data', 'timestamp', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_sensor_data_sensor_id ON sensor_data(sensor_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS alerts (
    id BIGSERIAL PRIMARY KEY,
    sensor_id VARCHAR(50) REFERENCES sensors(id),
    timestamp TIMESTAMPTZ NOT NULL,
    level INTEGER NOT NULL,
    message TEXT,
    acknowledged BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_sensor_id ON alerts(sensor_id, timestamp DESC);

INSERT INTO sensors (id, name, location) VALUES
    ('S001', '泄漏电流传感器-1号', 'A相绝缘子'),
    ('S002', '泄漏电流传感器-2号', 'B相绝缘子'),
    ('S003', '泄漏电流传感器-3号', 'C相绝缘子')
ON CONFLICT (id) DO NOTHING;
