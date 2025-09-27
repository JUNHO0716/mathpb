import GoogleStrategy from 'passport-google-oauth20';
import { Strategy as NaverStrategy } from 'passport-naver';
import { Strategy as KakaoStrategy } from 'passport-kakao';
import db from './database.js';

export default function(passport) {
  // GoogleStrategy 설정 (변경 없음)
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      const name = profile.displayName;
      const avatarUrl = profile.photos && profile.photos[0]?.value || null;

      const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
      let user;
      if (rows.length) {
        user = rows[0];
        if (avatarUrl && (!user.avatarUrl || user.avatarUrl === '/icon_my_b.png')) {
          await db.query('UPDATE users SET avatarUrl=? WHERE id=?', [avatarUrl, user.id]);
          user.avatarUrl = avatarUrl;
        }
      } else {
        await db.query(
          'INSERT INTO users (id, email, name, password, phone, avatarUrl) VALUES (?, ?, ?, NULL, "", ?)',
          [profile.id, email, name, avatarUrl]
        );
        const [newUser] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        user = newUser[0];
      }

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

  // NaverStrategy 설정 (변경 없음)
  passport.use(new NaverStrategy({
    clientID: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET,
    callbackURL: process.env.NAVER_CALLBACK_URL
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      const name = profile.displayName;
      const avatarUrl = profile._json.profile_image || null;
      
      const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
      let user;
      if (rows.length) {
        user = rows[0];
        if (avatarUrl && (!user.avatarUrl || user.avatarUrl === '/icon_my_b.png')) {
          await db.query('UPDATE users SET avatarUrl=? WHERE id=?', [avatarUrl, user.id]);
          user.avatarUrl = avatarUrl;
        }
      } else {
        await db.query(
          'INSERT INTO users (id, email, name, password, phone, avatarUrl) VALUES (?, ?, ?, NULL, "", ?)',
          [profile.id, email, name, avatarUrl]
        );
        const [newUser] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        user = newUser[0];
      }

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

  // [수정된 KakaoStrategy 설정]
  passport.use(new KakaoStrategy({
    clientID: process.env.KAKAO_CLIENT_ID,
    callbackURL: process.env.KAKAO_CALLBACK_URL
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      // 1. 카카오 프로필에서 필요한 정보를 가져옵니다.
      const id = profile.id;
      const avatarUrl = profile._json.properties.profile_image || null;

      // 2. 요청대로 DB에 저장할 email과 name 값을 설정합니다.
      const emailForDb = profile.displayName; // 카카오 닉네임을 -> DB email 컬럼에 저장
      const nameForDb = 'Kakao';            // 'Kakao'라는 글자를 -> DB name 컬럼에 저장

      // 3. 사용자가 이미 있는지 카카오 ID로 확인합니다.
      const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);

      if (rows.length) {
        // 이미 가입된 사용자인 경우, 요청대로 email과 name 정보를 업데이트합니다.
        await db.query(
            'UPDATE users SET email = ?, name = ?, avatarUrl = ? WHERE id = ?',
            [emailForDb, nameForDb, avatarUrl, id]
        );
      } else {
        // 신규 사용자인 경우, 요청대로 email과 name 정보로 새로 추가합니다.
        await db.query(
          'INSERT INTO users (id, email, name, password, phone, avatarUrl) VALUES (?, ?, ?, NULL, "", ?)',
          [id, emailForDb, nameForDb, avatarUrl]
        );
      }
      
      // 4. 최종적으로 업데이트된 사용자 정보를 DB에서 다시 불러옵니다.
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