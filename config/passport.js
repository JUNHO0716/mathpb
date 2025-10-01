import GoogleStrategy from 'passport-google-oauth20';
import { Strategy as NaverStrategy } from 'passport-naver';
import { Strategy as KakaoStrategy } from 'passport-kakao';
import db from './database.js';

export default function(passport) {
  // --- GoogleStrategy 설정 (계정 통합 로직 적용) ---
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const id = String(profile.id);
      const email = profile.emails?.[0]?.value || null;
      const name = profile.displayName;
      const avatarUrl = profile.photos?.[0]?.value || null;

      const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);

      if (rows.length) {
        // 구글로 로그인한 기록이 이미 있는 사용자
        await db.query('UPDATE users SET email = ?, name = ?, avatarUrl = ? WHERE id = ?', [email, name, avatarUrl, id]);
      } else {
        // 구글 로그인은 처음이지만, 같은 이메일의 계정이 있는지 확인
        const [emailRows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (emailRows.length) {
          // 이메일이 이미 존재하면, 해당 계정에 구글 ID를 업데이트하여 연결 (계정 통합)
          await db.query('UPDATE users SET id = ?, avatarUrl = ? WHERE email = ?', [id, avatarUrl, email]);
        } else {
          // 완전히 새로운 사용자
          await db.query(
            'INSERT INTO users (id, email, name, password, phone, avatarUrl) VALUES (?, ?, ?, NULL, "", ?)',
            [id, email, name, avatarUrl]
          );
        }
      }
      
      const [[user]] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
      return done(null, {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl || '/icon_my_b.png'
      });
    } catch (err) {
      console.error('Google Strategy error:', err);
      return done(err);
    }
  }));

  // --- NaverStrategy 설정 (계정 통합 로직 적용) ---
  passport.use(new NaverStrategy({
    clientID: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET,
    callbackURL: process.env.NAVER_CALLBACK_URL
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const id = String(profile.id);
      const email = profile.emails?.[0]?.value || null;
      const name = profile.displayName;
      const avatarUrl = profile._json.profile_image || null;
      
      const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
      if (rows.length) {
        // 네이버로 로그인한 기록이 이미 있는 사용자
        await db.query('UPDATE users SET email = ?, name = ?, avatarUrl = ? WHERE id = ?', [email, name, avatarUrl, id]);
      } else {
        // 네이버 로그인은 처음이지만, 같은 이메일의 계정이 있는지 확인
        const [emailRows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (emailRows.length) {
          // 이메일이 이미 존재하면, 해당 계정에 네이버 ID를 업데이트하여 연결 (계정 통합)
          await db.query('UPDATE users SET id = ?, avatarUrl = ? WHERE email = ?', [id, avatarUrl, email]);
        } else {
          // 완전히 새로운 사용자
          await db.query(
            'INSERT INTO users (id, email, name, password, phone, avatarUrl) VALUES (?, ?, ?, NULL, "", ?)',
            [id, email, name, avatarUrl]
          );
        }
      }
      
      const [[user]] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
      return done(null, {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl || '/icon_my_b.png'
      });
    } catch (err) {
      console.error('Naver Strategy error:', err);
      return done(err);
    }
  }));

  // --- KakaoStrategy 설정 (이메일 처리 수정 및 계정 통합 로직 적용) ---
  passport.use(new KakaoStrategy({
    clientID: process.env.KAKAO_CLIENT_ID,
    callbackURL: process.env.KAKAO_CALLBACK_URL
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const id = String(profile.id);
      // 실제 카카오 계정 이메일을 가져오도록 수정
      const email = profile._json?.kakao_account?.email || null;
      const name = profile.displayName;
      const avatarUrl = profile._json?.properties?.profile_image || null;

      const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);

      if (rows.length) {
        // 카카오로 로그인한 기록이 이미 있는 사용자
        await db.query('UPDATE users SET email = ?, name = ?, avatarUrl = ? WHERE id = ?', [email, name, avatarUrl, id]);
      } else {
        // 카카오 로그인은 처음이지만, 같은 이메일의 계정이 있는지 확인
        const [emailRows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (emailRows.length) {
          // 이메일이 이미 존재하면, 해당 계정에 카카오 ID를 업데이트하여 연결 (계정 통합)
          await db.query('UPDATE users SET id = ?, avatarUrl = ? WHERE email = ?', [id, avatarUrl, email]);
        } else {
          // 완전히 새로운 사용자
          await db.query(
            'INSERT INTO users (id, email, name, password, phone, avatarUrl) VALUES (?, ?, ?, NULL, "", ?)',
            [id, email, name, avatarUrl]
          );
        }
      }
      
      const [[user]] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
      
      return done(null, {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl || '/icon_my_b.png'
      });
    } catch (err) {
      console.error('Kakao Strategy error:', err);
      return done(err);
    }
  }));

  passport.serializeUser((user, done) => {
    done(null, user);
  });
  
  passport.deserializeUser((obj, done) => {
    done(null, obj);
  });
}