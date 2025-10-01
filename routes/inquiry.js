// routes/inquiry.js

import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES 모듈에서 __dirname 설정
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const DB_FILE = path.join(__dirname, '../inquiries.json'); // 저장될 파일 위치 (프로젝트 루트)

// POST /api/inquiry - 새로운 문의 접수
router.post('/', async (req, res) => {
    try {
        // 1. 프론트에서 받은 데이터에 서버 시간, 고유 ID 추가
        const newInquiry = {
            id: Date.now(), // 고유 ID로 현재 타임스탬프 사용
            ...req.body,
            status: 'pending', // 'pending', 'answered' 등의 상태 추가 가능
            receivedAt: new Date().toISOString(),
        };

        // 2. 기존 문의 내역 불러오기
        let inquiries = [];
        try {
            const data = await fs.readFile(DB_FILE, 'utf8');
            inquiries = JSON.parse(data);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            // 파일이 없으면 빈 배열로 시작 (ENOENT: No such file or directory)
        }

        // 3. 새 문의를 배열에 추가하고 파일에 저장
        inquiries.push(newInquiry);
        await fs.writeFile(DB_FILE, JSON.stringify(inquiries, null, 2), 'utf8');

        console.log('✅ 새로운 문의가 성공적으로 저장되었습니다:', newInquiry);
        
        // 4. 프론트엔드에 성공 응답 전송
        res.status(201).json({ success: true, message: '문의가 성공적으로 접수되었습니다.' });

    } catch (error) {
        console.error('❌ 문의 처리 중 서버 오류 발생:', error);
        res.status(500).json({ success: false, message: '서버 내부 오류가 발생했습니다.' });
    }
});

export default router;