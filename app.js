// app.js
const express = require('express');
const path    = require('path');
const cors    = require('cors');
const app     = express();
const port    = 3001;

app.use(express.json());
app.use(cors());
// public 폴더를 정적 제공
app.use(express.static(path.join(__dirname, 'public')));

// → 2단계에서 만들 API 라우터들을 이 아래에 추가할 예정
//    GET/POST /api/folders, /api/folders/:id/subfolders, /api/folders/:id/sheets, DELETE 등

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
