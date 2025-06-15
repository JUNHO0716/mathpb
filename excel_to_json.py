import pandas as pd

# 엑셀 파일명/경로
EXCEL_FILE = 'problems.xlsx'   # .xlsx 또는 .csv 둘 다 가능
JSON_FILE = 'problems.json'    # 결과 파일명

def excel_to_json(excel_file, json_file):
    # 파일 확장자에 따라 다르게 읽기
    if excel_file.lower().endswith('.csv'):
        df = pd.read_csv(excel_file, dtype=str)
    else:
        df = pd.read_excel(excel_file, dtype=str)
    # NaN → 빈 문자열로 처리
    df = df.fillna('')
    # id, year, etc. 숫자 필드는 int로 변환(선택)
    for col in ['id', 'year']:
        if col in df.columns:
            try:
                df[col] = df[col].astype(int)
            except:
                pass
    # JSON으로 저장(한글, 특수문자 깨지지 않게)
    df.to_json(json_file, orient='records', force_ascii=False, indent=2)
    print(f"✅ 변환 완료! → {json_file}")

if __name__ == "__main__":
    excel_to_json(EXCEL_FILE, JSON_FILE)
