from flask import Flask, request, send_file, jsonify
from flask_cors import CORS   # ← CORS 허용
import os
import tempfile

app = Flask(__name__)
CORS(app)  # ← CORS 허용 (필수!)

PROBLEM_FOLDER = os.path.join(os.getcwd(), 'problems')

@app.route('/')
def index():
    return '서버 실행 중!'

@app.route('/merge', methods=['POST'])
def merge_hwp():
    data = request.json
    file_names = data.get('files')
    if not file_names or not isinstance(file_names, list):
        return jsonify({"error": "파일 리스트가 없습니다."}), 400

    # 실제 파일 경로 리스트 만들기
    file_paths = [os.path.join(PROBLEM_FOLDER, fn) for fn in file_names]
    # 병합 함수 호출
    merged_file = merge_hwp_files(file_paths)
    if merged_file and os.path.exists(merged_file):
        return send_file(merged_file, as_attachment=True, download_name="문제지.hwp")
    else:
        return jsonify({"error": "병합 실패"}), 500

def merge_hwp_files(file_paths):
    """
    한글 pywin32 자동화: 여러 hwp 파일을 한 페이지에 이어붙임(섹션 없이)
    """
    try:
        import win32com.client as win32
        import pythoncom

        pythoncom.CoInitialize()
        hwp = win32.Dispatch("HWPFrame.HwpObject")
        hwp.RegisterModule("FilePathCheckDLL", "SecurityModule")
        hwp.XHwpWindows.Item(0).Visible = False

        # 첫 번째 문제 파일 열기 (기존 내용은 유지)
        hwp.Open(os.path.abspath(file_paths[0]))

        # 나머지 파일은 문서 맨 끝에 붙여넣기 (2줄 띄우고 삽입)
        for f in file_paths[1:]:
            hwp.MovePos(3)  # 문서 끝으로 이동
            hwp.Run("BreakPara")
            hwp.Run("BreakPara")  # ← 2줄 띄우기 (원하면 줄 수 조절 가능)
            hwp.HAction.GetDefault("InsertFile", hwp.HParameterSet.HInsertFile.HSet)
            hwp.HParameterSet.HInsertFile.filename = os.path.abspath(f)
            hwp.HParameterSet.HInsertFile.KeepSection = 0
            hwp.HAction.Execute("InsertFile", hwp.HParameterSet.HInsertFile.HSet)

        # 임시파일로 저장
        fd, out_path = tempfile.mkstemp(suffix='.hwp')
        os.close(fd)
        hwp.SaveAs(out_path)
        hwp.Quit()
        return out_path
    except Exception as e:
        print('병합 실패:', e)
        return None

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
