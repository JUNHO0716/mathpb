const express = require('express');
const router = express.Router();

router.get('/test', (req, res) => {
  res.send('✅ router.js 정상 작동 중!');
});

module.exports = router;