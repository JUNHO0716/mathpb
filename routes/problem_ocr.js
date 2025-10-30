import express from "express";
import { spawnSync } from "child_process";
import multer from "multer";
import path from "path";
import fs from "fs";
import findSimilar from "../services/search/find_similar.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post("/upload-problem", upload.single("file"), async (req, res) => {
  try {
    const imagePath = path.resolve(req.file.path);

    // ✅ 절대경로로 Python 호출 (Windows 호환)
    const pythonPath = "C:\\Users\\dgth0\\AppData\\Local\\Programs\\Python\\Python312\\python.exe";
    const py = spawnSync(pythonPath, ["services/ocr/ocr_extract.py", imagePath], {
      encoding: "utf-8"
    });

    if (py.error) {
      console.error("❌ Python 실행 실패:", py.error);
      throw new Error("Python 실행 실패");
    }

    console.log("📤 Python STDOUT:", py.stdout);
    console.log("⚠️ Python STDERR:", py.stderr);

    if (!py.stdout) throw new Error("Python OCR 결과 없음");

    const output = JSON.parse(py.stdout);
    const ocrText = output.text;
    const similar = await findSimilar(ocrText);

    res.json({ success: true, ocrText, similar });
  } catch (err) {
    console.error("❌ OCR 처리 오류:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
