import sys
from PIL import Image
import pytesseract
import json

# ✅ Tesseract 경로 지정 (윈도우 수동 설치 시 필수)
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

def extract_text(image_path):
    text = pytesseract.image_to_string(Image.open(image_path), lang="kor+eng")
    return text.strip()

if __name__ == "__main__":
    path = sys.argv[1]
    result = extract_text(path)
    print(json.dumps({"text": result}, ensure_ascii=False))
