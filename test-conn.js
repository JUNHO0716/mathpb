// test-conn.js
const db = require('./db');

(async () => {
  try {
    const conn = await db.getConnection();
    console.log('✅ DB 연결 성공!');
    conn.release();
  } catch (err) {
    console.error('❌ DB 연결 실패:', err);
  }
})();
