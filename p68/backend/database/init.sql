-- PostgreSQL + PostGIS 初始化脚本

-- 启用PostGIS扩展
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- 区域表
CREATE TABLE IF NOT EXISTS regions (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    min_lat FLOAT NOT NULL,
    max_lat FLOAT NOT NULL,
    min_lon FLOAT NOT NULL,
    max_lon FLOAT NOT NULL,
    available_years JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 道路段表
CREATE TABLE IF NOT EXISTS road_segments (
    id VARCHAR(128) PRIMARY KEY,
    osm_id BIGINT NOT NULL,
    name VARCHAR(255),
    highway_type VARCHAR(64) NOT NULL,
    geometry GEOMETRY(LineString, 4326) NOT NULL,
    first_seen_year INTEGER NOT NULL,
    last_seen_year INTEGER NOT NULL,
    region_id VARCHAR(64) REFERENCES regions(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建空间索引
CREATE INDEX IF NOT EXISTS idx_road_geometry ON road_segments USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_road_region ON road_segments(region_id);
CREATE INDEX IF NOT EXISTS idx_road_year_range ON road_segments(first_seen_year, last_seen_year);

-- PBF解析任务表
CREATE TABLE IF NOT EXISTS pbf_tasks (
    id VARCHAR(64) PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    region_id VARCHAR(64) REFERENCES regions(id),
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- 初始数据 - 示例区域
INSERT INTO regions (id, name, min_lat, max_lat, min_lon, max_lon, available_years)
VALUES 
    ('beijing', '北京市', 39.7, 40.1, 116.2, 116.6, '[2018,2019,2020,2021,2022,2023,2024]'::jsonb),
    ('shanghai', '上海市', 31.1, 31.4, 121.3, 121.6, '[2018,2019,2020,2021,2022,2023,2024]'::jsonb),
    ('guangzhou', '广州市', 23.0, 23.3, 113.2, 113.5, '[2018,2019,2020,2021,2022,2023,2024]'::jsonb)
ON CONFLICT (id) DO NOTHING;
