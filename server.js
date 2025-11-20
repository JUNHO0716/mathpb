import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import session from 'express-session';
import passport from 'passport';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

// --- ES 모듈에서 __dirname, require 사용 설정 ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// --- 설정 파일 임포트 ---
import configurePassport from './config/passport.js';

// --- 미들웨어 임포트 ---
import { isLoggedIn, isAdmin, isSubscribed, requirePlan } from './middleware/auth.js';
import { commonLimiter, multerErrorHandler } from './middleware/security.js';

// --- 라우트 파일 임포트 ---
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import fileRoutes from './routes/files.js';
import boardRoutes from './routes/board.js';
import paymentRoutes from './routes/payment.js';
import adminRoutes from './routes/admin.js';
import noticeRoutes from './routes/notices.js';
import inquiryRoutes from './routes/inquiry.js';
import chatRoutes from './routes/chat.js';
import problemOCR from "./routes/problem_ocr.js";
import coverageRoutes from './routes/coverage.js'; // ✅ 추가
import myMemosRouter from './routes/myMemos.js';
import neisRoutes from './routes/neis_sync.js';
import scheduleRoutes from './routes/schedule.js';
import adminSchoolsRouter from './routes/admin_schools.js';

const app = express();
const PROD = process.env.NODE_ENV === 'production';

// --- 기본 미들웨어 설정 ---
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(commonLimiter);

app.use(cors({
  origin: PROD
    ? ['https://mathpb.com']
    : ['https://mathpb.com', 'http://mathpb.com', 'http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: PROD,
    maxAge: 1000 * 60 * 60 * 2 // 2시간
  }
}));

// --- 보안 헤더 설정 ---
app.use(helmet({
  contentSecurityPolicy: false,
  hsts: PROD ? { maxAge: 60 * 60 * 24 * 180, includeSubDomains: true, preload: false } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(helmet.frameguard({ action: 'sameorigin' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// --- Passport 초기화 ---
app.use(passport.initialize());
app.use(passport.session());
configurePassport(passport); // Passport 전략 설정 실행

// --- 에러 핸들러 ---
app.use(multerErrorHandler);

// --- 라우터 연결 ---
app.use('/', authRoutes);
app.use(userRoutes);
app.use(fileRoutes);

// 🔍 학교 주소 조회 라우터를 /api/admin 보다 먼저 연결
app.use(adminSchoolsRouter);

app.use('/api/board', boardRoutes);
app.use('/api/billing', paymentRoutes);
app.use('/api/admin', adminRoutes);
console.log('[mount] /api/admin -> routes/admin.js');
app.use('/api/notices', noticeRoutes);
app.use('/api/inquiry', inquiryRoutes);
app.use("/api/chat", chatRoutes);
app.use('/api/coverage', isLoggedIn, coverageRoutes); // ✅ 추가 (로그인 사용자만 조회)
app.use('/api/schedule', isLoggedIn, scheduleRoutes);
app.use(myMemosRouter);
app.use('/api/admin/neis', isLoggedIn, isAdmin, neisRoutes);

// --- 특수 라우트 (Toss 프록시, DB 핑) ---
app.get('/ping-db', async (req, res) => {
  const { default: db } = await import('./config/database.js');  // ✅
  try {
    const [rows] = await db.query('SELECT NOW() AS now');
    res.send(`✅ DB 연결 성공! 현재 시간: ${rows[0].now}`);
  } catch (e) {
    console.error('❌ DB 연결 실패:', e);
    res.status(500).send('DB 연결 실패');
  }
});

app.get('/toss/v2.js', async (req, res) => {
  try {
    const upstream = await fetch('https://js.tosspayments.com/v2', {
      headers: { 'User-Agent': req.get('User-Agent') || 'Mozilla/5.0' }
    });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(502).type('text/plain').send(`Upstream ${upstream.status}\n${text}`);
    }
    res.set('content-type', upstream.headers.get('content-type') || 'application/javascript; charset=utf-8');
    res.set('cache-control', 'public, max-age=600');
    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch (e) {
    console.error('Toss v2 proxy error:', e);
    return res.status(500).type('text/plain').send('Proxy failed');
  }
});

app.use("/api", problemOCR);
app.use(express.static("public"));

// --- 정적 페이지 라우팅 및 접근 제어 ---
const PUBLIC_PAGES = ['login.html', 'resetpw.html', 'signup.html', 'terms.html', 'privacy.html', 'refund.html', 'finance.html', 'high.html'];
// ⬇️ high.html 은 공개 페이지로 전환
const MEMBER_ONLY_PAGES = ['index.html', 'home.html', 'problem_bank.html', 'middle.html', 'bookcase.html', 'notice.html', 'profile.html', 'cs.html'];
const ADMIN_PAGES = ['admin.html', 'admin_files.html', 'admin_Membership.html', 'admin_payment.html', 'admin_upload_review.html', 'admin_review.html', 'admin_upload.html'];

PUBLIC_PAGES.forEach(page => app.get('/' + page, (req, res) => res.sendFile(path.join(__dirname, 'public', page))));
MEMBER_ONLY_PAGES.forEach(page => app.get('/' + page, isLoggedIn, (req, res) => res.sendFile(path.join(__dirname, 'public', page))));
ADMIN_PAGES.forEach(page => app.get('/' + page, isLoggedIn, isAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', page))));

// high 페이지: Basic 이상이면 접근 가능
app.get('/high.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'high.html'));
});

// upload 페이지: Standard 이상만 접근 가능
app.get('/upload.html', requirePlan('standard'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

// 루트 접근 제어
app.get('/', (req, res) => {
  if (!req.session?.user) return res.redirect('/login.html');
  return res.redirect('/index.html');
});

// --- 정적 파일 제공 ---
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    else if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
    else if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css; charset=UTF-8');
  }
}));

// [옵션] 주 1회 자동 동기화 (일요일 새벽 3시, Asia/Seoul 기준)
if (process.env.NODE_ENV === 'production') {
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const kickoff = async () => {
    try {
      const res = await fetch(`${process.env.BASE_URL || 'https://mathpb.com'}/api/admin/neis/sync`, {
        method: 'POST', credentials: 'include'
      });

      const text = await res.text().catch(() => '');
      console.log('[NEIS weekly sync] status =', res.status);
    } catch (e) { console.error('[NEIS weekly sync] failed', e); }
  };
  setTimeout(kickoff, 30_000);           // 서버 기동 30초 후 1회
  setInterval(kickoff, ONE_WEEK_MS);     // 매주
}


// --- 서버 실행 ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`서버 실행 http://localhost:${PORT}`);
});