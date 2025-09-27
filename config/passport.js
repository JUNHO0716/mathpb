import GoogleStrategy from 'passport-google-oauth20';
import { Strategy as NaverStrategy } from 'passport-naver';
import { Strategy as KakaoStrategy } from 'passport-kakao';
import db from './database.js';

export default function(passport) {
  // GoogleStrategy 설정
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      // [수정] 숫자 ID를 문자열로 변경
      const id = String(profile.id);
      const email = profile.emails[0].value;
      const name = profile.displayName;
      const avatarUrl = profile.photos && profile.photos[0]?.value || null;

      // [수정] id로 사용자를 먼저 찾도록 로직 변경
      const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
      let user;
      if (rows.length) {
        user = rows[0];
        // 이메일이나 이름이 다를 경우 업데이트 (선택적)
        if (user.email !== email || user.name !== name) {
            await db.query('UPDATE users SET email = ?, name = ? WHERE id = ?', [email, name, id]);
        }
        if (avatarUrl && (!user.avatarUrl || user.avatarUrl === '/icon_my_b.png')) {
          await db.query('UPDATE users SET avatarUrl=? WHERE id=?', [avatarUrl, id]);
        }
      } else {
        await db.query(
          'INSERT INTO users (id, email, name, password, phone, avatarUrl) VALUES (?, ?, ?, NULL, "", ?)',
          [id, email, name, avatarUrl] // 수정된 id 변수 사용
        );
      }
      
      const [[finalUser]] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
      user = finalUser;

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

  // NaverStrategy 설정
  passport.use(new NaverStrategy({
    clientID: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET,
    callbackURL: process.env.NAVER_CALLBACK_URL
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      // [수정] 숫자 ID를 문자열로 변경
      const id = String(profile.id);
      const email = profile.emails[0].value;
      const name = profile.displayName;
      const avatarUrl = profile._json.profile_image || null;
      
      const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
      let user;
      if (rows.length) {
        user = rows[0];
        if (user.email !== email || user.name !== name) {
            await db.query('UPDATE users SET email = ?, name = ? WHERE id = ?', [email, name, id]);
        }
        if (avatarUrl && (!user.avatarUrl || user.avatarUrl === '/icon_my_b.png')) {
          await db.query('UPDATE users SET avatarUrl=? WHERE id=?', [avatarUrl, id]);
        }
      } else {
        await db.query(
          'INSERT INTO users (id, email, name, password, phone, avatarUrl) VALUES (?, ?, ?, NULL, "", ?)',
          [id, email, name, avatarUrl]
        );
      }
      
      const [[finalUser]] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
      user = finalUser;

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

  // KakaoStrategy 설정
  passport.use(new KakaoStrategy({
    clientID: process.env.KAKAO_CLIENT_ID,
    callbackURL: process.env.KAKAO_CALLBACK_URL
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      // [수정] 숫자 ID를 문자열로 변경
      const id = String(profile.id);
      const emailForDb = profile.displayName;
      const nameForDb = 'Kakao';
      const avatarUrl = profile._json.properties.profile_image || null;

      const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);

      if (rows.length) {
        await db.query(
            'UPDATE users SET email = ?, name = ?, avatarUrl = ? WHERE id = ?',
            [emailForDb, nameForDb, avatarUrl, id]
        );
      } else {
        await db.query(
          'INSERT INTO users (id, email, name, password, phone, avatarUrl) VALUES (?, ?, ?, NULL, "", ?)',
          [id, emailForDb, nameForDb, avatarUrl]
        );
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