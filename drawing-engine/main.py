import asyncio
from bullmq import Worker, Queue
import time
import cv2 # OpenCV
import numpy as np
import ezdxf # DXF 생성용
import os

# 결과를 다시 NestJS로 보내기 위한 큐 설정
result_queue = Queue("drawing-results", {
    "connection": "redis://127.0.0.1:6379"
})

async def process_drawing(job, job_id):
    data = job.data
    input_path = f"../backend-api/{data['filePath']}"
    
    # 1. 프론트엔드/백엔드에서 넘어온 5개 파라미터 수신
    block_size = data.get('blockSize', 11) 
    c_value = data.get('cValue', 2)
    line_thresh = data.get('lineThresh', 80)    # 직선 검출 감도
    min_dist = data.get('minDist', 50)          # 원형 간 최소 거리
    circle_param = data.get('circleParam', 30)  # 원형 검출 정밀도
    mode = data.get('mode', 'FINAL').upper()

    try:
        img = cv2.imread(input_path)
        if img is None: raise Exception("이미지 로드 실패")

        # 2. 기본 전처리 (그레이스케일 & 블러)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)

        # 3. 적응형 임계값 처리 (Adaptive Threshold)
        if block_size % 2 == 0: block_size += 1
        thresh = cv2.adaptiveThreshold(
            blurred, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            block_size,
            c_value
        )

        if mode == 'PREVIEW':
            # --- 🚀 지능형 미리보기 모드: 실시간 시각화 ---
            # 흑백(thresh) 이미지를 컬러(BGR)로 변환하여 그 위에 색깔 선을 그립니다.
            preview_canvas = cv2.cvtColor(thresh, cv2.COLOR_GRAY2BGR)
            
            # (A) 직선 검출 시각화 (빨간색)
            edges = cv2.Canny(thresh, 50, 150)
            lines = cv2.HoughLinesP(edges, 1, np.pi/180, 
                                   threshold=line_thresh, 
                                   minLineLength=30, maxLineGap=10)
            if lines is not None:
                for line in lines:
                    x1, y1, x2, y2 = line[0]
                    cv2.line(preview_canvas, (x1, y1), (x2, y2), (0, 0, 255), 2)

            # (B) 원형 검출 시각화 (초록색)
            circles = cv2.HoughCircles(blurred, cv2.HOUGH_GRADIENT, 1, 
                                      minDist=min_dist, 
                                      param1=50, param2=circle_param, 
                                      minRadius=10, maxRadius=100)
            if circles is not None:
                circles = np.uint16(np.around(circles))
                for i in circles[0, :]:
                    cv2.circle(preview_canvas, (i[0], i[1]), i[2], (0, 255, 0), 2)
            
            preview_path = input_path.rsplit('.', 1)[0] + "_preview.png"
            cv2.imwrite(preview_path, preview_canvas)
            
            await result_queue.add("preview-ready", {
                "drawingId": data['drawingId'],
                "status": "PREVIEW_READY",
                "previewUrl": preview_path.replace("../backend-api/", "")
            })
            print(f"🖼️ [PREVIEW] 시각화 완료: 직선 감도({line_thresh}), 원형 거리({min_dist})")

        else:
            # --- 🚀 최종 변환 모드: 지능형 DXF 생성 ---
            output_dxf_path = input_path.rsplit('.', 1)[0] + ".dxf"
            doc = ezdxf.new(dxfversion="R2010")
            msp = doc.modelspace()

            # (A) 직선 검출 및 수평/수직 보정 적용
            edges = cv2.Canny(thresh, 50, 150)
            lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=line_thresh, 
                                   minLineLength=30, maxLineGap=10)
            if lines is not None:
                for line in lines:
                    x1, y1, x2, y2 = line[0]
                    # 수직/수평 보정 로직 (15픽셀 미만 오차 고정)
                    if abs(x1 - x2) < 15: x2 = x1
                    if abs(y1 - y2) < 15: y2 = y1
                    msp.add_line((float(x1), float(-y1)), (float(x2), float(-y2)))

            # (B) 원형 검출 및 DXF 추가
            circles = cv2.HoughCircles(blurred, cv2.HOUGH_GRADIENT, 1, minDist=min_dist, 
                                      param1=50, param2=circle_param, minRadius=10, maxRadius=100)
            if circles is not None:
                circles = np.uint16(np.around(circles))
                for i in circles[0, :]:
                    msp.add_circle((float(i[0]), float(-i[1])), float(i[2]))

            doc.saveas(output_dxf_path)
            
            await result_queue.add("completed", {
                "drawingId": data['drawingId'],
                "status": "COMPLETED",
                "resultUrl": output_dxf_path.replace("../backend-api/", "")
            })
            print(f"✨ [FINAL] 지능형 DXF 변환 완료: {output_dxf_path}")

    except Exception as e:
        print(f"❌ 에러 발생: {e}")

async def main():
    print("🚀 Drawing Engine Worker 가동 중... (Hough Transform Mode)")
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