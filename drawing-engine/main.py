import asyncio
from bullmq import Worker, Queue
import time
import cv2
import numpy as np
import ezdxf
import os
import pytesseract
from PIL import Image
from pillow_heif import register_heif_opener
# 🚀 추가: 환경 변수 로드를 위한 라이브러리
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

# Pillow에서 HEIC를 지원하도록 등록
register_heif_opener()

# 🚀 환경 변수 적용: Redis 주소
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")
# 🚀 환경 변수 적용: 백엔드 API 상대 경로
BACKEND_API_BASE_PATH = os.getenv("BACKEND_API_PATH", "../backend-api")
# 🚀 환경 변수 적용: Tesseract 경로 (필요 시)
if os.getenv("TESSERACT_PATH"):
    pytesseract.pytesseract.tesseract_cmd = os.getenv("TESSERACT_PATH")

result_queue = Queue("drawing-results", {
    "connection": REDIS_URL
})

async def process_drawing(job, job_id):
    data = job.data
    # 🚀 수정: 환경 변수 기반 경로 설정
    input_path = os.path.join(BACKEND_API_BASE_PATH, data['filePath'])
    
    block_size = data.get('blockSize', 11) 
    c_value = data.get('cValue', 2)
    line_thresh = data.get('lineThresh', 80)
    min_dist = data.get('minDist', 50)
    circle_param = data.get('circleParam', 30)
    mode = data.get('mode', 'FINAL').upper()

    try:
        img = None
        if input_path.lower().endswith('.heic'):
            heif_file = Image.open(input_path)
            img_rgb = np.array(heif_file.convert('RGB'))
            img = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
            print(f"📸 HEIC 이미지 변환 로드 완료")
        else:
            img = cv2.imread(input_path)

        if img is None: 
            raise Exception(f"이미지 로드 실패: {input_path}")
        
        height, width = img.shape[:2]
        center_x, center_y = width // 2, height // 2

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)

        if block_size % 2 == 0: block_size += 1
        thresh = cv2.adaptiveThreshold(
            blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV, block_size, c_value
        )

        edges = cv2.Canny(thresh, 50, 150)
        detected_lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=line_thresh, 
                                        minLineLength=30, maxLineGap=10)
        
        detected_circles = cv2.HoughCircles(blurred, cv2.HOUGH_GRADIENT, 1, minDist=min_dist, 
                                           param1=50, param2=circle_param, minRadius=10, maxRadius=100)

        custom_config = r'--oem 3 --psm 6 -c tessedit_char_whitelist=0123456789'
        extracted_text = pytesseract.image_to_string(thresh, config=custom_config) 

        raw_words = extracted_text.split()
        dimensions = []

        for word in raw_words:
            clean_word = "".join(filter(str.isdigit, word))
            # 필터링: 1자리이상, 1미만(너무 작은 숫자)이나 50000이상(비현실적 숫자)은 무시
            if len(clean_word) >= 1:
                num = int(clean_word)
                if 1 <= num <= 5000:
                    dimensions.append(str(num))

        dimensions = sorted(list(set(dimensions)), key=int)
        print(f"✅ [정제된 수치 리스트]: {dimensions}")

        if mode == 'PREVIEW':
            preview_canvas = cv2.cvtColor(thresh, cv2.COLOR_GRAY2BGR)
            if detected_lines is not None:
                for line in detected_lines:
                    x1, y1, x2, y2 = line[0]
                    cv2.line(preview_canvas, (x1, y1), (x2, y2), (0, 0, 255), 2)
            if detected_circles is not None:
                circles = np.uint16(np.around(detected_circles))
                for i in circles[0, :]:
                    cv2.circle(preview_canvas, (i[0], i[1]), i[2], (0, 255, 0), 2)
            
            preview_path = input_path.rsplit('.', 1)[0] + "_preview.png"
            cv2.imwrite(preview_path, preview_canvas)
            
            await result_queue.add("preview-ready", {
                "drawingId": data['drawingId'],
                "status": "PREVIEW_READY",
                "previewUrl": preview_path.replace(BACKEND_API_BASE_PATH + "/", ""),
                "extractedDimensions": dimensions
            })

        else:
            output_dxf_path = input_path.rsplit('.', 1)[0] + ".dxf"
            doc = ezdxf.new(dxfversion="R2010")
            msp = doc.modelspace()

            if detected_lines is not None:
                for line in detected_lines:
                    x1, y1, x2, y2 = line[0]
                    if abs(x1 - x2) < 15: x2 = x1
                    if abs(y1 - y2) < 15: y2 = y1
                    msp.add_line(
                        (float(x1) - center_x, center_y - float(y1)), 
                        (float(x2) - center_x, center_y - float(y2))
                    )

            if detected_circles is not None:
                for i in detected_circles[0, :]:
                    cx, cy, r = i
                    msp.add_circle(
                        (float(cx) - center_x, center_y - float(cy)), 
                        float(r)
                    )

            doc.saveas(output_dxf_path)
            await result_queue.add("completed", {
                "drawingId": data['drawingId'], 
                "status": "COMPLETED", 
                "resultUrl": output_dxf_path.replace(BACKEND_API_BASE_PATH + "/", "")
            })
            print(f"✨ 변환 완료 및 신호 전송")

    except Exception as e:
        print(f"❌ 에러 발생: {e}")

async def main():
    print(f"🚀 Drawing Engine Worker 가동 중... (Redis: {REDIS_URL})")
    worker = Worker("drawing-conversion", process_drawing, {
        "connection": REDIS_URL # 🚀 환경 변수 주소 적용
    })
    try:
        while True:
            await asyncio.sleep(1)
    except asyncio.CancelledError:
        await worker.close()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nWorker 종료 중...")