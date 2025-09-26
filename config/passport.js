import GoogleStrategy from 'passport-google-oauth20';
import { Strategy as NaverStrategy } from 'passport-naver';
import { Strategy as KakaoStrategy } from 'passport-kakao';
import db from './database.js';

export default function(passport) {
  // [2] GoogleStrategy 설정
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      const name = profile.displayName;
      const avatarUrl = profile.photos && profile.photos[0]?.value || null;

      // DB에 이미 있는 유저인지 확인
      const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

      let user;
      if (rows.length) {
        user = rows[0];
        // DB에 사진이 없으면 업데이트
        if (avatarUrl && (!user.avatarUrl || user.avatarUrl === '/icon_my_b.png')) {
          await db.query('UPDATE users SET avatarUrl=? WHERE id=?', [avatarUrl, user.id]);
          user.avatarUrl = avatarUrl; // 메모리상에도 갱신
        }
      } else {
        // 신규 가입: avatarUrl까지 같이 저장!
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

  // [3] NaverStrategy 설정
  passport.use(new NaverStrategy({
    clientID: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET,
    callbackURL: process.env.NAVER_CALLBACK_URL
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      const name = profile.displayName;
      const avatarUrl = profile._json.profile_image || null;

      // DB에 이미 있는 유저인지 확인
      const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

      let user;
      if (rows.length) {
        user = rows[0];
        // DB에 사진이 없거나 기본 이미지이면 업데이트
        if (avatarUrl && (!user.avatarUrl || user.avatarUrl === '/icon_my_b.png')) {
          await db.query('UPDATE users SET avatarUrl=? WHERE id=?', [avatarUrl, user.id]);
          user.avatarUrl = avatarUrl;
        }
      } else {
        // 신규 가입
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

  // [4] KakaoStrategy 설정
  passport.use(new KakaoStrategy({
    clientID: process.env.KAKAO_CLIENT_ID,
    callbackURL: process.env.KAKAO_CALLBACK_URL
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile._json.kakao_account.email;
      const name = profile.displayName;
      const avatarUrl = profile._json.properties.profile_image || null;

      // DB에 이미 있는 유저인지 확인
      const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

      let user;
      if (rows.length) {
        user = rows[0];
        // DB에 사진이 없거나 기본 이미지이면 업데이트
        if (avatarUrl && (!user.avatarUrl || user.avatarUrl === '/icon_my_b.png')) {
          await db.query('UPDATE users SET avatarUrl=? WHERE id=?', [avatarUrl, user.id]);
          user.avatarUrl = avatarUrl;
        }
      } else {
        // 신규 가입
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