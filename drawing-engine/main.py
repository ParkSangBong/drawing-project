import asyncio
from bullmq import Worker, Queue
import time
import cv2
import numpy as np
import ezdxf
import os
# 🚀 필수: HEIC 처리를 위한 라이브러리
from PIL import Image
from pillow_heif import register_heif_opener

# Pillow에서 HEIC를 지원하도록 등록
register_heif_opener()

result_queue = Queue("drawing-results", {
    "connection": "redis://127.0.0.1:6379"
})

async def process_drawing(job, job_id):
    data = job.data
    input_path = f"../backend-api/{data['filePath']}"
    
    block_size = data.get('blockSize', 11) 
    c_value = data.get('cValue', 2)
    line_thresh = data.get('lineThresh', 80)
    min_dist = data.get('minDist', 50)
    circle_param = data.get('circleParam', 30)
    mode = data.get('mode', 'FINAL').upper()

    try:
        # 🚀 [수정] 이미지 로더 파트
        img = None
        if input_path.lower().endswith('.heic'):
            # HEIC 파일 처리
            heif_file = Image.open(input_path)
            # RGB로 변환 후 numpy 배열로 전환
            img_rgb = np.array(heif_file.convert('RGB'))
            # OpenCV 형식인 BGR로 최종 변환
            img = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
            print(f"📸 HEIC 이미지 변환 로드 완료")
        else:
            # 일반 이미지 처리
            img = cv2.imread(input_path)

        if img is None: 
            raise Exception(f"이미지 로드 실패: {input_path}")
        
        # --- 이후 로직은 동일 (중앙점 계산 및 검출) ---
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
            await result_queue.add("preview-ready", {"drawingId": data['drawingId'], "status": "PREVIEW_READY", "previewUrl": preview_path.replace("../backend-api/", "")})

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
            await result_queue.add("completed", {"drawingId": data['drawingId'], "status": "COMPLETED", "resultUrl": output_dxf_path.replace("../backend-api/", "")})
            print(f"✨ 변환 완료 및 신호 전송")

    except Exception as e:
        print(f"❌ 에러 발생: {e}")

async def main():
    print("🚀 Drawing Engine Worker 가동 중... (HEIC & Hough Mode)")
    worker = Worker("drawing-conversion", process_drawing, {
        "connection": "redis://127.0.0.1:6379"
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