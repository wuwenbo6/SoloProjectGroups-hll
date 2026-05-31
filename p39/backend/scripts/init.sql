-- 创建扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 创建示例区域配置
INSERT INTO zone_config (zone_id, name, x, y, width, height, max_capacity, ap_ids) VALUES
('waiting_area_1', '候车区A', 0.05, 0.1, 0.4, 0.35, 150, 'AP-001,AP-002'),
('waiting_area_2', '候车区B', 0.55, 0.1, 0.4, 0.35, 150, 'AP-003'),
('boarding_gate', '登机口', 0.25, 0.55, 0.5, 0.3, 200, 'AP-004'),
('entrance', '入口大厅', 0.05, 0.55, 0.2, 0.4, 100, 'AP-005')
ON CONFLICT (zone_id) DO NOTHING;

-- 创建索引优化查询
CREATE INDEX IF NOT EXISTS idx_probe_data_timestamp ON probe_data(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_passenger_count_timestamp ON passenger_count(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_passenger_count_zone_time ON passenger_count(zone, timestamp DESC);
