const fileInput = document.getElementById("fileInput");
const previewImg = document.getElementById("previewImg");
const canvas = document.getElementById("selectCanvas");
const ctx = canvas.getContext("2d");
const form = document.getElementById("uploadForm");
const result = document.getElementById("result");

let startX, startY, endX, endY;
let isDrawing = false;
let hasSelection = false;

// ✅ 이미지 업로드 시 미리보기
fileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  previewImg.src = url;

  previewImg.onload = () => {
    canvas.width = previewImg.clientWidth;
    canvas.height = previewImg.clientHeight;
    canvas.style.width = previewImg.clientWidth + "px";
    canvas.style.height = previewImg.clientHeight + "px";
    canvas.style.position = "absolute";
    canvas.style.left = previewImg.offsetLeft + "px";
    canvas.style.top = previewImg.offsetTop + "px";
    canvas.style.zIndex = 10;
    canvas.style.background = "transparent";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasSelection = false;
  };
});

// ✅ 드래그 시작
canvas.addEventListener("mousedown", e => {
  const rect = canvas.getBoundingClientRect();
  startX = e.clientX - rect.left;
  startY = e.clientY - rect.top;
  isDrawing = true;
});

// ✅ 드래그 중: 사각형 그리기 (시각 표시)
canvas.addEventListener("mousemove", e => {
  if (!isDrawing) return;
  const rect = canvas.getBoundingClientRect();
  const curX = e.clientX - rect.left;
  const curY = e.clientY - rect.top;
  const width = curX - startX;
  const height = curY - startY;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  ctx.setLineDash([6]);
  ctx.strokeRect(startX, startY, width, height);
});

// ✅ 드래그 끝: 박스 고정
canvas.addEventListener("mouseup", e => {
  isDrawing = false;
  const rect = canvas.getBoundingClientRect();
  endX = e.clientX - rect.left;
  endY = e.clientY - rect.top;

  const cropW = Math.abs(endX - startX);
  const cropH = Math.abs(endY - startY);

  if (cropW < 5 || cropH < 5) {
    alert("⚠️ 너무 작은 영역입니다. 다시 설정해주세요.");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasSelection = false;
    return;
  }

  // 🔴 고정된 영역 표시 (드래그 해제 후 남김)
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.strokeRect(startX, startY, cropW, cropH);
  hasSelection = true;
});

// ✅ “문제 영역 설정 후 검색” 버튼 클릭 시 OCR 요청
form.addEventListener("submit", async e => {
  e.preventDefault();

  if (!hasSelection) {
    alert("먼저 문제 영역을 드래그하여 선택해주세요!");
    return;
  }

  const cropX = Math.min(startX, endX);
  const cropY = Math.min(startY, endY);
  const cropW = Math.abs(endX - startX);
  const cropH = Math.abs(endY - startY);

  // 선택된 영역만 잘라서 OCR 전송
  const cropped = document.createElement("canvas");
  cropped.width = cropW;
  cropped.height = cropH;
  cropped
    .getContext("2d")
    .drawImage(previewImg, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  cropped.toBlob(async blob => {
    if (!blob) {
      alert("⚠️ 이미지 잘라내기 실패. 다시 시도해주세요.");
      return;
    }

    const formData = new FormData();
    formData.append("file", blob, "problem.jpg");

    result.innerHTML = "<p>🔄 문제 분석 중...</p>";

    try {
      const res = await fetch("/api/upload-problem", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      renderResult(data);
    } catch (err) {
      console.error("업로드 오류:", err);
      alert("❌ 분석 중 오류가 발생했습니다.");
    }
  }, "image/jpeg");
});

// ✅ 결과 렌더링
function renderResult(data) {
  if (!data.success) {
    result.innerHTML = `<p>❌ 분석 실패: ${data.error}</p>`;
    return;
  }

  result.innerHTML = `
    <h3>📖 인식된 문제</h3>
    <p>${data.ocrText}</p>
    <h3>🔍 유사한 문제</h3>
    ${data.similar
      .map(
        p => `
      <div class="result-item">
        <strong>${p.source}</strong><br/>
        ${p.title}
      </div>`
      )
      .join("")}
  `;
}
