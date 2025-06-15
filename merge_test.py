import requests

url = 'http://127.0.0.1:5000/merge'
# 실제 problems 폴더 안에 있는 파일명으로 변경!
payload = {'files': ['문제_001.hwp', '문제_002.hwp']}
res = requests.post(url, json=payload)
if res.status_code == 200:
    with open('병합_문제지.hwp', 'wb') as f:
        f.write(res.content)
    print('병합 성공, 파일 저장됨!')
else:
    print('에러:', res.text)
