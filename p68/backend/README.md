# OSM History Viewer - Backend

## 安装依赖

```bash
pip install -r requirements.txt
```

## 启动服务

```bash
python main.py
```

服务将在 `http://localhost:8000` 启动。

## API 文档

启动后访问 `http://localhost:8000/docs` 查看 Swagger 文档。

## API Endpoints

- `GET /api/regions` - 获取所有地区列表
- `GET /api/roads?regionId={id}&year={year}` - 获取指定地区和年份的道路数据
- `GET /api/stats?regionId={id}` - 获取统计数据
- `POST /api/upload-pbf` - 上传PBF文件进行解析
- `GET /api/tasks/{taskId}` - 获取解析任务状态

## 数据库

默认使用 SQLite 数据库（`osm_history.db`），可通过环境变量 `DATABASE_URL` 配置 PostgreSQL。

### PostgreSQL + PostGIS

1. 创建数据库并启用 PostGIS 扩展
2. 执行 `database/init.sql` 初始化表结构
3. 设置环境变量：
   ```bash
   export DATABASE_URL="postgresql://user:password@localhost/osm_history"
   ```
