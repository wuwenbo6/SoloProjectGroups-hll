const express = require('express');
const router = express.Router();
const { generateToken, verifyToken, getAlgorithmInfo } = require('../utils/jwt');
const { getClientIp } = require('../utils/ip');
const { generateAntiLeechUrl, verifyAntiLeechUrl } = require('../utils/antileech');
const { getActiveStreams, getRecentLogs } = require('../utils/audit');

const RTMP_SERVER_HOST = process.env.RTMP_SERVER_HOST || 'localhost';
const RTMP_SERVER_PORT = process.env.RTMP_SERVER_PORT || '1935';
const RTMP_APP_NAME = process.env.RTMP_APP_NAME || 'live';
const ENABLE_IP_BINDING = process.env.ENABLE_IP_BINDING !== 'false';
const ENABLE_ANTILEECH = process.env.ENABLE_ANTILEECH !== 'false';

router.get('/info', (req, res) => {
  res.json({
    algorithm: getAlgorithmInfo(),
    ipBinding: ENABLE_IP_BINDING,
    antiLeech: ENABLE_ANTILEECH,
  });
});

function buildStreamUrls(streamKey, token, tokenEncoded, antileechResult) {
  const rtmpBaseUrl = `rtmp://${RTMP_SERVER_HOST}:${RTMP_SERVER_PORT}/${RTMP_APP_NAME}`;
  const httpBaseUrl = `http://${RTMP_SERVER_HOST}:8080`;

  const rtmpPushBase = `${rtmpBaseUrl}/${streamKey}`;
  const rtmpPullBase = `${rtmpBaseUrl}/${streamKey}`;
  const hlsBase = `${httpBaseUrl}/hls/${streamKey}.m3u8`;
  const httpFlvBase = `${httpBaseUrl}/live/${streamKey}.flv`;

  const hasToken = token && tokenEncoded;
  const hasAntileech = antileechResult && antileechResult.url;

  function buildUrl(base, withToken, withAntileech) {
    let url = base;
    const params = [];

    if (withToken && hasToken) {
      params.push(`token=${tokenEncoded}`);
    }

    if (withAntileech && hasAntileech) {
      const antileechParams = antileechResult.url.split('?')[1];
      if (antileechParams) {
        params.push(antileechParams);
      }
    }

    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }

    return url;
  }

  return {
    rtmp: {
      push: buildUrl(rtmpPushBase, true, true),
      pull: buildUrl(rtmpPullBase, true, true),
    },
    hls: buildUrl(hlsBase, true, true),
    httpFlv: buildUrl(httpFlvBase, true, true),
    antileech: {
      enabled: ENABLE_ANTILEECH,
      ...(antileechResult ? {
        timestamp: antileechResult.timestamp,
        signature: antileechResult.signature,
        expiresAt: antileechResult.expiresAt,
        ttl: antileechResult.ttl,
      } : {}),
    },
  };
}

router.post('/generate', (req, res) => {
  try {
    const { streamKey, userId, ttl, antileechTtl } = req.body;

    if (!streamKey) {
      return res.status(400).json({ error: '缺少streamKey参数' });
    }

    const clientIp = getClientIp(req);

    const payload = {
      sub: userId || 'anonymous',
      streamKey: streamKey,
      ip: ENABLE_IP_BINDING ? clientIp : null,
      type: 'push_pull',
      iat: Math.floor(Date.now() / 1000),
    };

    const tokenTtl = ttl || parseInt(process.env.TOKEN_TTL_SECONDS) || 86400;
    const token = generateToken(payload);
    const tokenEncoded = encodeURIComponent(token);

    let antileechResult = null;
    if (ENABLE_ANTILEECH) {
      const rtmpBaseUrl = `rtmp://${RTMP_SERVER_HOST}:${RTMP_SERVER_PORT}/${RTMP_APP_NAME}/${streamKey}`;
      antileechResult = generateAntiLeechUrl(rtmpBaseUrl, streamKey, {
        ttl: antileechTtl || parseInt(process.env.ANTILEECH_TTL) || 3600,
      });
    }

    const urls = buildStreamUrls(streamKey, token, tokenEncoded, antileechResult);
    const expiresAt = new Date(Date.now() + tokenTtl * 1000).toISOString();

    res.json({
      success: true,
      token: token,
      streamKey: streamKey,
      expiresAt: expiresAt,
      ttl: tokenTtl,
      ipBinding: ENABLE_IP_BINDING ? clientIp : null,
      algorithm: getAlgorithmInfo(),
      urls: urls,
    });
  } catch (err) {
    console.error('Token generation error:', err);
    res.status(500).json({ error: '生成Token失败', detail: err.message });
  }
});

router.post('/antileech', (req, res) => {
  try {
    const { streamKey, ttl } = req.body;

    if (!streamKey) {
      return res.status(400).json({ error: '缺少streamKey参数' });
    }

    const rtmpBaseUrl = `rtmp://${RTMP_SERVER_HOST}:${RTMP_SERVER_PORT}/${RTMP_APP_NAME}/${streamKey}`;
    const httpHlsBase = `http://${RTMP_SERVER_HOST}:8080/hls/${streamKey}.m3u8`;
    const httpFlvBase = `http://${RTMP_SERVER_HOST}:8080/live/${streamKey}.flv`;

    const antileechTtl = ttl || parseInt(process.env.ANTILEECH_TTL) || 3600;
    const rtmpResult = generateAntiLeechUrl(rtmpBaseUrl, streamKey, { ttl: antileechTtl });
    const hlsResult = generateAntiLeechUrl(httpHlsBase, streamKey, { ttl: antileechTtl });
    const flvResult = generateAntiLeechUrl(httpFlvBase, streamKey, { ttl: antileechTtl });

    res.json({
      success: true,
      streamKey: streamKey,
      antileech: {
        timestamp: rtmpResult.timestamp,
        signature: rtmpResult.signature,
        expiresAt: rtmpResult.expiresAt,
        ttl: antileechTtl,
      },
      urls: {
        rtmp: {
          push: rtmpResult.url,
          pull: rtmpResult.url,
        },
        hls: hlsResult.url,
        httpFlv: flvResult.url,
      },
    });
  } catch (err) {
    console.error('AntiLeech URL generation error:', err);
    res.status(500).json({ error: '生成防盗链URL失败', detail: err.message });
  }
});

router.get('/verify', (req, res) => {
  const token = req.query.token || (req.headers['authorization'] && req.headers['authorization'].slice(7));

  if (!token) {
    return res.status(400).json({ error: '缺少Token参数' });
  }

  const result = verifyToken(token);
  if (!result.valid) {
    return res.status(401).json({ valid: false, error: result.error });
  }

  res.json({
    valid: true,
    decoded: result.decoded,
    expiresAt: new Date(result.decoded.exp * 1000).toISOString(),
  });
});

router.get('/streams/active', (req, res) => {
  res.json({
    success: true,
    streams: getActiveStreams(),
  });
});

router.get('/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json({
    success: true,
    logs: getRecentLogs(limit),
  });
});

module.exports = router;
