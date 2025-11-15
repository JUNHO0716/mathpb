import express from 'express';
import bcrypt from 'bcrypt';
import db from '../config/database.js';
import { isLoggedIn, requirePlan } from '../middleware/auth.js';
import { avatarUpload, fileUpload, deleteS3 } from '../config/s3.js';

const router = express.Router();

// 사업자 번호 업데이트
router.post('/api/update-biznum', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { bizNum } = req.body;
    if (!bizNum) return res.json({ success: false });
    await db.query('UPDATE users SET bizNum = ? WHERE id = ?', [bizNum, userId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 학원 정보 저장
router.post('/api/save-academy', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { name, phone } = req.body;
    if (!name) return res.json({ success: false, msg: '학원명을 입력하세요.' });

    await db.query(
      'UPDATE users SET academyName = ?, academyPhone = ? WHERE id = ?',
      [name, phone || '', userId]
    );

    req.session.user.academyName  = name;
    req.session.user.academyPhone = phone || '';
    req.session.save(err => {
      if (err) console.error('세션 저장 오류:', err);
    });

    res.json({ success: true });
  } catch (e) {
    console.error('/api/save-academy error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// 학원 주소 저장
router.post('/api/save-academy-address', isLoggedIn, async (req, res) => {
  const userId = req.session.user?.id;
  const { address } = req.body;
  if (!userId || !address) return res.json({ success: false });

  await db.execute('UPDATE users SET academyAddress = ? WHERE id = ?', [address, userId]);
  res.json({ success: true });
});

// 프로필 사진 업로드
router.post('/api/upload-profile-photo', isLoggedIn, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: '업로드된 파일이 없습니다.' });
    }
    const url = req.file.location;
    await db.query('UPDATE users SET avatarUrl=? WHERE id=?', [url, req.session.user.id]);
    req.session.user.avatarUrl = url;
    req.session.save(err => {
      if (err) {
        console.error('세션 저장 오류:', err);
        return res.status(500).json({ msg: '세션 저장 오류' });
      }
      res.json({ success: true, avatarUrl: url });
    });
  } catch (e) {
    console.error('프로필 사진 업로드 오류:', e);
    res.status(500).json({ msg: '서버 오류', error: e.message });
  }
});

// 프로필 사진 삭제
router.delete('/api/delete-profile-photo', isLoggedIn, async (req, res) => {
  try {
    const url = req.session.user.avatarUrl;
    if (url && !url.includes('/icon_my_b.png')) {
      const key = url.split('.amazonaws.com/')[1];
      await deleteS3(key);
    }
    await db.query('UPDATE users SET avatarUrl=? WHERE id=?', ['/icon_my_b.png', req.session.user.id]);
    req.session.user.avatarUrl = '/icon_my_b.png';
    res.json({ success: true, avatarUrl: '/icon_my_b.png' });
  } catch (e) {
    console.error('프로필 삭제 오류:', e);
    res.status(500).json({ msg: '삭제 오류', error: e.message });
  }
});

// 비밀번호 확인
router.post('/api/check-password', isLoggedIn, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.json({ success: false, msg: '비밀번호를 입력하세요.' });
  try {
    const [rows] = await db.query('SELECT password FROM users WHERE id=?', [req.session.user.id]);
    if (!rows.length) return res.json({ success: false, msg: '사용자 정보 없음' });
    const valid = await bcrypt.compare(password, rows[0].password);
    if (valid) return res.json({ success: true });
    return res.json({ success: false, msg: '비밀번호가 일치하지 않습니다.' });
  } catch (e) {
    res.json({ success: false, msg: '서버 오류' });
  }
});

// 휴대폰 번호 변경
router.post('/api/change-phone', isLoggedIn, async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ success: false, msg: '새 휴대폰 번호를 입력하세요.' });
  }
  try {
    await db.query('UPDATE users SET phone=? WHERE id=?', [phone, req.session.user.id]);
    req.session.user.phone = phone;
    req.session.save();
    res.json({ success: true });
  } catch (e) {
    console.error('Phone change error:', e);
    res.status(500).json({ success: false, msg: '휴대폰 번호 변경 오류' });
  }
});

// 이메일 변경
router.post('/api/change-email', isLoggedIn, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, msg: '새 이메일 주소를 입력하세요.' });
  }
  try {
    const [rows] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (rows.length > 0 && rows[0].id !== req.session.user.id) {
        return res.status(409).json({ success: false, msg: '이미 사용 중인 이메일입니다.' });
    }
    await db.query('UPDATE users SET email=? WHERE id=?', [email, req.session.user.id]);
    req.session.user.email = email;
    req.session.save();
    res.json({ success: true });
  } catch (e) {
    console.error('Email change error:', e);
    res.status(500).json({ success: false, msg: '이메일 변경 오류' });
  }
});

// 사용자 파일 업로드
router.post('/api/user-upload', requirePlan('standard'), fileUpload.array('fileInput', 10), async (req, res) => {
    try {
      const userId = req.session.user.id;
      const files  = req.files;
      if (!files || !files.length) {
        return res.status(400).json({ msg: '파일이 없습니다.' });
      }
      for (const f of files) {
       const decodedName = Buffer.from(f.originalname, 'latin1').toString('utf8');
        await db.query(
          'INSERT INTO uploads (user_id, filename, s3_key, status) VALUES (?, ?, ?, ?)',
          [userId, decodedName, f.key, '확인중']
        );
      }
      res.json({ msg: '업로드 성공' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ msg: '서버 오류', error: e.message });
    }
  }
);

// 내 업로드 목록
router.get('/api/my-uploads', isLoggedIn, async (req, res) => {
  try {
    const [rows] = await db.query(`
       SELECT id, filename, status, reject_reason, uploaded_at AS created_at, completed_at, memo
      FROM uploads
      WHERE user_id = ?
      ORDER BY uploaded_at DESC
    `, [req.session.user.id]);
    res.json(rows);
  } catch (e) {
    console.error('my-uploads 조회 오류:', e);
    res.status(500).json({ msg: '업로드 조회 실패', error: e.message });
  }
});

// 내 업로드 통계
router.get('/api/my-uploads/stats', isLoggedIn, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
          COUNT(CASE WHEN status = '확인중' THEN 1 END) AS pending,
          COUNT(CASE WHEN status = '제작중' THEN 1 END) AS producing,
          COUNT(CASE WHEN status = '완료' THEN 1 END) AS completed,
          COUNT(CASE WHEN status = '반려' THEN 1 END) AS rejected
       FROM uploads
       WHERE user_id = ?`,
      [req.session.user.id]
    );
    res.json(rows[0] || { pending: 0, producing: 0, completed: 0, rejected: 0 });
  } catch (e) {
    console.error('my-uploads-stats 조회 오류:', e);
    res.status(500).json({ msg: '통계 조회 실패' });
  }
});

// 내 업로드 삭제
router.delete('/api/uploads/:id', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const uploadId = req.params.id;
    const [result] = await db.query(
      'DELETE FROM uploads WHERE id = ? AND user_id = ?',
      [uploadId, userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ msg: '삭제할 업로드가 없거나 권한이 없습니다.' });
    }
    res.json({ msg: '삭제 성공' });
  } catch (err) {
    console.error('DELETE /api/uploads/:id error:', err);
    res.status(500).json({ msg: '서버 오류' });
  }
});

router.get('/api/users/stats', isLoggedIn, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
          (SELECT COUNT(*) FROM users) AS totalUsers,
          (SELECT COUNT(*) FROM users WHERE is_subscribed = 1) AS subscribedUsers,
          (SELECT COUNT(*) FROM users WHERE last_login >= NOW() - INTERVAL 1 DAY) AS activeUsers`
    );
    res.json(rows[0] || { totalUsers: 0, subscribedUsers: 0, activeUsers: 0 });
  } catch (e) {
    console.error('users-stats 조회 오류:', e);
    res.status(500).json({ msg: '통계 조회 실패' });
  }
});

// [신규 추가] 내 업로드 메모 저장/수정
router.patch('/api/uploads/:id/memo', isLoggedIn, async (req, res) => {
  try {
    const uploadId = req.params.id;         // URL에서 파일 ID 가져오기
    const userId = req.session.user.id;     // 세션에서 현재 로그인한 사용자 ID 가져오기
    const { memo } = req.body;              // 요청 본문에서 메모 내용 가져오기

    if (memo === undefined) {
      return res.status(400).json({ msg: '메모 내용이 없습니다.' });
    }

    // SQL Injection을 방지하고, 본인의 업로드만 수정 가능하도록 user_id를 함께 확인합니다.
    const [result] = await db.query(
      'UPDATE uploads SET memo = ? WHERE id = ? AND user_id = ?',
      [memo, uploadId, userId]
    );

    // 업데이트된 행이 없으면, 해당 파일이 없거나 수정 권한이 없는 것입니다.
    if (result.affectedRows === 0) {
      return res.status(404).json({ msg: '해당 업로드 파일을 찾을 수 없거나 수정 권한이 없습니다.' });
    }

    // 성공적으로 업데이트된 경우
    res.json({ msg: '메모가 성공적으로 저장되었습니다.' });

  } catch (err) {
    console.error('PATCH /api/uploads/:id/memo error:', err);
    res.status(500).json({ msg: '메모 저장 중 서버 오류가 발생했습니다.' });
  }
});

export default router;