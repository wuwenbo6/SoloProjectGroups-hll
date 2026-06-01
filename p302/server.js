const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const HMAC_SECRET = "hls-aes128-secret-key-2026";
const TOKEN_TTL_SECONDS = 300;
const KEY_ROTATION_INTERVAL_MS = 30000;
const KEY_HISTORY_RETENTION_MS = 600000;
const MAX_LOG_ENTRIES = 1000;

const REFERER_WHITELIST = [
  "http://localhost:3000",
  "https://example.com",
  "https://player.example.com",
];

const KEY_DEFS = [
  { id: "kid_001", name: "HD 标准密钥", streams: ["stream_001", "stream_002"] },
  { id: "kid_002", name: "4K 高级密钥", streams: ["stream_003"] },
  { id: "kid_003", name: "测试密钥", streams: ["stream_004", "stream_005"] },
];

const HLS_KEYS = {};
const keyRotationTimers = {};
const requestLogs = [];

function createKeyVersion(kid) {
  const now = Date.now();
  const version = now;
  return {
    key_id: `${kid}_v${version}`,
    kid,
    key: crypto.randomBytes(16),
    created_at: now,
    expires_at: now + KEY_HISTORY_RETENTION_MS,
  };
}

function initKeyStore() {
  KEY_DEFS.forEach((def) => {
    HLS_KEYS[def.id] = {
      id: def.id,
      name: def.name,
      streams: def.streams,
      history: [createKeyVersion(def.id)],
    };
  });
}

function getActiveKey(kid) {
  const keyData = HLS_KEYS[kid];
  if (!keyData || !keyData.history.length) return null;
  return keyData.history[keyData.history.length - 1];
}

function findKeyById(kid, keyId) {
  const keyData = HLS_KEYS[kid];
  if (!keyData) return null;
  return keyData.history.find((v) => v.key_id === keyId);
}

function rotateKey(kid) {
  const keyData = HLS_KEYS[kid];
  if (!keyData) return;

  const newVersion = createKeyVersion(kid);
  keyData.history.push(newVersion);

  const now = Date.now();
  keyData.history = keyData.history.filter((v) => v.expires_at > now);

  console.log(`🔄 密钥轮换: ${kid} → ${newVersion.key_id} (${newVersion.key.toString("hex")})`);
}

function startKeyRotation() {
  KEY_DEFS.forEach((def) => {
    keyRotationTimers[def.id] = setInterval(() => {
      rotateKey(def.id);
    }, KEY_ROTATION_INTERVAL_MS);
  });
  console.log(`⏰ 密钥轮换定时器已启动，间隔 ${KEY_ROTATION_INTERVAL_MS / 1000} 秒`);
}

function stopKeyRotation() {
  Object.values(keyRotationTimers).forEach((t) => clearInterval(t));
}

function logRequest(entry) {
  const logEntry = {
    id: crypto.randomBytes(8).toString("hex"),
    timestamp: Date.now(),
    ...entry,
  };
  requestLogs.unshift(logEntry);
  if (requestLogs.length > MAX_LOG_ENTRIES) {
    requestLogs.pop();
  }
  return logEntry;
}

function exportLogs(format = "json") {
  const headers = [
    "id",
    "timestamp",
    "datetime",
    "status",
    "kid",
    "key_id",
    "stream_id",
    "referer",
    "origin",
    "client_ip",
    "error",
  ];

  if (format === "csv") {
    const rows = requestLogs.map((log) =>
      headers
        .map((h) => {
          let val = log[h] || "";
          if (h === "datetime") val = new Date(log.timestamp).toISOString();
          if (typeof val === "string" && val.includes(",")) val = `"${val}"`;
          return val;
        })
        .join(",")
    );
    return [headers.join(","), ...rows].join("\n");
  }

  return JSON.stringify(
    requestLogs.map((log) => ({
      ...log,
      datetime: new Date(log.timestamp).toISOString(),
    })),
    null,
    2
  );
}

function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"] ||
    req.headers["x-real-ip"] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function generateToken(kid, streamId) {
  const activeKey = getActiveKey(kid);
  if (!activeKey) return null;

  const expires = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${kid}:${activeKey.key_id}:${streamId}:${expires}`;
  const signature = crypto
    .createHmac("sha256", HMAC_SECRET)
    .update(payload)
    .digest("hex");
  return {
    token: `${payload}:${signature}`,
    expires,
    kid,
    key_id: activeKey.key_id,
  };
}

function verifyToken(expectedStreamId, token) {
  const parts = token.split(":");
  if (parts.length !== 5) return { valid: false, reason: "token格式无效" };

  const [tKid, tKeyId, tStreamId, tExpires, tSignature] = parts;

  if (tStreamId !== expectedStreamId)
    return { valid: false, reason: "streamId不匹配", kid: tKid, key_id: tKeyId };

  if (!HLS_KEYS[tKid])
    return { valid: false, reason: "无效的kid", kid: tKid, key_id: tKeyId };

  const keyVersion = findKeyById(tKid, tKeyId);
  if (!keyVersion)
    return { valid: false, reason: "key_id不存在或已过期", kid: tKid, key_id: tKeyId };

  const now = Math.floor(Date.now() / 1000);
  if (parseInt(tExpires, 10) < now)
    return { valid: false, reason: "token已过期", kid: tKid, key_id: tKeyId };

  const expectedSig = crypto
    .createHmac("sha256", HMAC_SECRET)
    .update(`${tKid}:${tKeyId}:${tStreamId}:${tExpires}`)
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(tSignature), Buffer.from(expectedSig)))
    return { valid: false, reason: "签名验证失败", kid: tKid, key_id: tKeyId };

  return {
    valid: true,
    expires: parseInt(tExpires, 10),
    kid: tKid,
    key_id: tKeyId,
    key: keyVersion.key,
  };
}

function verifyReferer(req) {
  const referer = req.headers.referer || "";
  const origin = req.headers.origin || "";
  const checkList = [referer, origin];

  for (const value of checkList) {
    if (!value) continue;
    for (const allowed of REFERER_WHITELIST) {
      if (value === allowed || value.startsWith(allowed + "/")) {
        return { valid: true, matched: allowed, value };
      }
    }
  }

  return {
    valid: false,
    reason: "Referer不在白名单",
    referer,
    origin,
    allowed: REFERER_WHITELIST,
  };
}

function parseUrl(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  return url;
}

function jsonResponse(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Referer, Origin",
  });
  res.end(body);
}

function sendStaticFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      jsonResponse(res, 404, { error: "文件未找到" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = parseUrl(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Referer, Origin",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    sendStaticFile(res, path.join(__dirname, "public", "index.html"), "text/html; charset=utf-8");
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    jsonResponse(res, 200, {
      referer_whitelist: REFERER_WHITELIST,
      token_ttl_seconds: TOKEN_TTL_SECONDS,
      key_rotation_interval_ms: KEY_ROTATION_INTERVAL_MS,
      key_history_retention_ms: KEY_HISTORY_RETENTION_MS,
      max_log_entries: MAX_LOG_ENTRIES,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/keys") {
    jsonResponse(res, 200, {
      keys: Object.values(HLS_KEYS).map((k) => {
        const active = getActiveKey(k.id);
        return {
          kid: k.id,
          name: k.name,
          streams: k.streams,
          active_key_id: active ? active.key_id : null,
          active_key_hex: active ? active.key.toString("hex") : null,
          active_key_created_at: active ? active.created_at : null,
          history_count: k.history.length,
          history: k.history.map((v) => ({
            key_id: v.key_id,
            key_hex: v.key.toString("hex"),
            created_at: v.created_at,
            expires_at: v.expires_at,
          })),
        };
      }),
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/keys/rotate") {
    const kid = url.searchParams.get("kid");
    if (kid && HLS_KEYS[kid]) {
      rotateKey(kid);
      jsonResponse(res, 200, {
        success: true,
        kid,
        new_key: getActiveKey(kid),
      });
    } else if (!kid) {
      Object.keys(HLS_KEYS).forEach(rotateKey);
      jsonResponse(res, 200, {
        success: true,
        rotated: Object.keys(HLS_KEYS),
      });
    } else {
      jsonResponse(res, 400, { error: "无效的kid", available_kids: Object.keys(HLS_KEYS) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/token") {
    const kid = url.searchParams.get("kid");
    const streamId = url.searchParams.get("stream_id");

    if (!kid || !HLS_KEYS[kid]) {
      jsonResponse(res, 400, {
        error: "无效的kid",
        available_kids: Object.keys(HLS_KEYS),
      });
      return;
    }

    if (!streamId) {
      jsonResponse(res, 400, { error: "缺少stream_id参数" });
      return;
    }

    if (!HLS_KEYS[kid].streams.includes(streamId)) {
      jsonResponse(res, 400, {
        error: "streamId不在该kid的授权列表中",
        allowed_streams: HLS_KEYS[kid].streams,
      });
      return;
    }

    const tokenData = generateToken(kid, streamId);
    if (!tokenData) {
      jsonResponse(res, 500, { error: "生成Token失败，无可用密钥" });
      return;
    }

    jsonResponse(res, 200, {
      kid,
      key_id: tokenData.key_id,
      stream_id: streamId,
      token: tokenData.token,
      expires: tokenData.expires,
      key_url: `/api/key?stream_id=${streamId}&token=${tokenData.token}`,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/key") {
    const clientIp = getClientIp(req);
    const refererCheck = verifyReferer(req);
    const streamId = url.searchParams.get("stream_id");
    const token = url.searchParams.get("token");

    if (!refererCheck.valid) {
      logRequest({
        status: "rejected",
        error: refererCheck.reason,
        stream_id: streamId,
        token: token ? `${token.substring(0, 20)}...` : null,
        referer: refererCheck.referer,
        origin: refererCheck.origin,
        client_ip: clientIp,
      });
      jsonResponse(res, 403, {
        error: refererCheck.reason,
        referer: refererCheck.referer,
        origin: refererCheck.origin,
        allowed: refererCheck.allowed,
      });
      return;
    }

    if (!streamId || !token) {
      logRequest({
        status: "rejected",
        error: "缺少参数",
        stream_id: streamId,
        referer: refererCheck.referer,
        origin: refererCheck.origin,
        client_ip: clientIp,
      });
      jsonResponse(res, 400, { error: "缺少stream_id或token参数" });
      return;
    }

    const verification = verifyToken(streamId, token);

    if (!verification.valid) {
      logRequest({
        status: "rejected",
        error: verification.reason,
        kid: verification.kid,
        key_id: verification.key_id,
        stream_id: streamId,
        token: `${token.substring(0, 20)}...`,
        referer: refererCheck.referer,
        origin: refererCheck.origin,
        client_ip: clientIp,
      });
      jsonResponse(res, 403, { error: verification.reason });
      return;
    }

    logRequest({
      status: "success",
      kid: verification.kid,
      key_id: verification.key_id,
      stream_id: streamId,
      referer: refererCheck.referer,
      origin: refererCheck.origin,
      client_ip: clientIp,
    });

    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": 16,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Access-Control-Allow-Origin": "*",
      "X-Key-Kid": verification.kid,
      "X-Key-Id": verification.key_id,
      "X-Referer-Matched": refererCheck.matched,
    });
    res.end(verification.key);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/streams") {
    const streams = {};
    Object.values(HLS_KEYS).forEach((k) => {
      const active = getActiveKey(k.id);
      k.streams.forEach((s) => {
        if (!streams[s]) {
          streams[s] = { id: s, available_kids: [] };
        }
        streams[s].available_kids.push({
          kid: k.id,
          name: k.name,
          active_key_id: active ? active.key_id : null,
          active_key_hex: active ? active.key.toString("hex") : null,
        });
      });
    });
    jsonResponse(res, 200, { streams: Object.values(streams) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/logs") {
    const limit = parseInt(url.searchParams.get("limit") || "100", 10);
    const status = url.searchParams.get("status");
    const kid = url.searchParams.get("kid");

    let logs = requestLogs;
    if (status) logs = logs.filter((l) => l.status === status);
    if (kid) logs = logs.filter((l) => l.kid === kid);
    logs = logs.slice(0, Math.min(limit, MAX_LOG_ENTRIES));

    jsonResponse(res, 200, {
      total: requestLogs.length,
      returned: logs.length,
      logs: logs.map((l) => ({
        ...l,
        datetime: new Date(l.timestamp).toISOString(),
      })),
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/logs/export") {
    const format = (url.searchParams.get("format") || "json").toLowerCase();
    if (format !== "json" && format !== "csv") {
      jsonResponse(res, 400, { error: "不支持的格式，支持 json 或 csv" });
      return;
    }

    const content = exportLogs(format);
    const contentType = format === "csv" ? "text/csv; charset=utf-8" : "application/json";
    const disposition = `attachment; filename="key_request_logs.${format}"`;

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Disposition": disposition,
      "Access-Control-Allow-Origin": "*",
    });
    res.end(content);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/logs/clear") {
    const cleared = requestLogs.length;
    requestLogs.length = 0;
    jsonResponse(res, 200, { success: true, cleared });
    return;
  }

  jsonResponse(res, 404, { error: "路由未找到" });
});

initKeyStore();
startKeyRotation();

process.on("SIGINT", () => {
  stopKeyRotation();
  console.log("\n🛑 密钥轮换定时器已停止");
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`\n🔑 HLS AES-128 密钥服务器已启动`);
  console.log(`   地址: http://localhost:${PORT}`);
  console.log(`   前端: http://localhost:${PORT}/`);
  console.log(`\n📋 Referer 白名单:`);
  REFERER_WHITELIST.forEach((r) => console.log(`   ✅ ${r}`));
  console.log(`\n⏰ 密钥轮换:`);
  console.log(`   间隔: ${KEY_ROTATION_INTERVAL_MS / 1000} 秒`);
  console.log(`   历史保留: ${KEY_HISTORY_RETENTION_MS / 1000} 秒`);
  console.log(`\n📡 API 端点:`);
  console.log(`   GET /api/config                     - 查看服务器配置`);
  console.log(`   GET /api/keys                       - 查看所有kid密钥及历史`);
  console.log(`   GET /api/keys/rotate?kid=kid_001    - 手动轮换密钥`);
  console.log(`   GET /api/streams                    - 查看可用流及对应kid`);
  console.log(`   GET /api/token?kid=kid_001&stream_id=stream_001  - 获取带签名的token`);
  console.log(`   GET /api/key?stream_id=xxx&token=xxx  - 获取AES-128密钥`);
  console.log(`   GET /api/logs                       - 查看密钥请求日志`);
  console.log(`   GET /api/logs/export?format=json    - 导出日志 (json/csv)`);
  console.log(`   GET /api/logs/clear                 - 清空日志`);
  console.log(`\n🔐 密钥信息:`);
  Object.values(HLS_KEYS).forEach((k) => {
    const active = getActiveKey(k.id);
    console.log(`   ${k.id} (${k.name}): ${active ? active.key.toString("hex") : "(无)"}`);
    console.log(`     key_id: ${active ? active.key_id : "(无)"}`);
    console.log(`     授权流: ${k.streams.join(", ")}`);
    console.log(`     历史版本: ${k.history.length}`);
  });
  console.log();
});
