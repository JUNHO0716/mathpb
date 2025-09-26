import rateLimit from 'express-rate-limit';

const PROD = process.env.NODE_ENV === 'production';

const ALLOWED_HOSTS = new Set(
  PROD
    ? ['mathpb.com', 'www.mathpb.com']
    : ['mathpb.com', 'www.mathpb.com', 'localhost']
);

function getHostOnly(h) {
  return (h || '').toLowerCase().split(':')[0]; // 포트 제거
}

function originHost(urlStr) {
  try { return new URL(urlStr).hostname.toLowerCase(); }
  catch { return ''; }
}

export function verifyOrigin(req, res, next) {
  const origin  = req.get('Origin');
  const referer = req.get('Referer');
  const xfHost  = req.get('X-Forwarded-Host');
  const host    = req.get('Host');

  const oHost = originHost(origin);
  const rHost = originHost(referer);
  const hHost = getHostOnly(xfHost || host);

  const allowed =
    (oHost && ALLOWED_HOSTS.has(oHost)) ||
    (rHost && ALLOWED_HOSTS.has(rHost)) ||
    (hHost && ALLOWED_HOSTS.has(hHost));

  if (!allowed) {
    return res.status(403).json({ error: 'FORBIDDEN_ORIGIN', detail: '출처 검증 실패' });
  }
  next();
}

export const commonLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export const boardDownloadLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

export const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

export function multerErrorHandler(err, req, res, next) {
  if (err && err.field === 'avatar') {
    return res.status(400).json({ ok: false, code: err.code, msg: err.message, field: err.field });
  }
  next(err);
}