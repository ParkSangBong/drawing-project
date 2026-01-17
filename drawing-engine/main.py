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
    
    # [추가] 슬라이더로부터 넘어올 파라미터 (기본값 설정)
    # block_size: 격자 제거 범위, c_value: 선명도 감도
    block_size = data.get('blockSize', 11) 
    c_value = data.get('cValue', 2)
    mode = data.get('mode', 'FINAL').upper() # PREVIEW 또는 FINAL

    try:
        img = cv2.imread(input_path)
        if img is None: raise Exception("이미지 로드 실패")

        # 1. 전처리 (그레이스케일 & 블러)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)

        # 2. [핵심] 적응형 임계값 처리 (Adaptive Threshold)
        # 사용자가 조절한 block_size와 c_value를 여기에 적용합니다!
        if block_size % 2 == 0: block_size += 1 # 홀수 제약 조건
        
        thresh = cv2.adaptiveThreshold(
            blurred, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            block_size,
            c_value
        )

        if mode == 'PREVIEW':
            # --- 미리보기 모드: 처리된 이미지만 저장해서 결과 전송 ---
            preview_path = input_path.rsplit('.', 1)[0] + "_preview.png"
            cv2.imwrite(preview_path, thresh)
            
            await result_queue.add("preview-ready", {
                "drawingId": data['drawingId'],
                "status": "PREVIEW_READY",
                "previewUrl": preview_path.replace("../backend-api/", "")
            })
            print(f"🖼️ 미리보기 생성 완료 (BS:{block_size}, C:{c_value})")

        else:
            # # --- 최종 변환 모드: DXF 생성 (기존 로직) ---
            # output_dxf_path = input_path.rsplit('.', 1)[0] + ".dxf"
            # contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            # doc = ezdxf.new(dxfversion="R2010")
            # msp = doc.modelspace()

            # for cnt in contours:
            #     if cv2.contourArea(cnt) < 10: continue
            #     points = cnt.reshape(-1, 2)
            #     for i in range(len(points) - 1):
            #         p1 = (float(points[i][0]), float(-points[i][1]))
            #         p2 = (float(points[i+1][0]), float(-points[i+1][1]))
            #         msp.add_line(p1, p2)

            # doc.saveas(output_dxf_path)
            # await result_queue.add("completed", {
            #     "drawingId": data['drawingId'],
            #     "status": "COMPLETED",
            #     "resultUrl": output_dxf_path.replace("../backend-api/", "")
            # })
            # print(f"✨ 최종 DXF 생성 완료")

            #
            # --- 최종 변환 모드: DXF 생성 ---
            # output_dxf_path = input_path.rsplit('.', 1)[0] + ".dxf"
            # # output_dxf_path = input_path.rsplit('.', 1)[0] + "_fixed.dxf"
            # # 확인 로그 추가 (실제 어디에 저장되는지 터미널에서 보세요)
            # print(f"📍 실제 저장 경로: {os.path.abspath(output_dxf_path)}")
            # # [중요] 여기서 사용되는 'thresh'는 위에서 슬라이더 값(block_size, c_value)이 
            # # 적용되어 계산된 변수입니다. 따라서 이론적으로는 현재 잘 짜여진 상태입니다!
            # contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            # doc = ezdxf.new(dxfversion="R2010")
            # msp = doc.modelspace()

            # for cnt in contours:
            #     if cv2.contourArea(cnt) < 10: continue
            #     points = cnt.reshape(-1, 2)
            #     for i in range(len(points) - 1):
            #         p1 = (float(points[i][0]), float(-points[i][1]))
            #         p2 = (float(points[i+1][0]), float(-points[i+1][1]))
            #         msp.add_line(p1, p2)

            # doc.saveas(output_dxf_path) # 👈 이 코드가 실행되면 기존 DXF가 보정된 값으로 덮어씌워집니다.
            
            # # NestJS로 완료 신호 보냄
            # await result_queue.add("completed", {
            #     "drawingId": data['drawingId'],
            #     "status": "COMPLETED",
            #     "resultUrl": output_dxf_path.replace("../backend-api/", "")
            # })
            # print(f"✨ 최종 DXF 생성 완료 (보정값 적용됨)")

            # --- 최종 변환 모드: DXF 생성 ---
            output_dxf_path = input_path.rsplit('.', 1)[0] + ".dxf"
            
            # 1. 윤곽선 추출
            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            doc = ezdxf.new(dxfversion="R2010")
            msp = doc.modelspace()

            for cnt in contours:
                # 🚀 [개선 1] 면적 필터링 강화
                # 너무 작은 점(먼지)은 무시합니다. (숫자를 키울수록 더 큰 것만 남음)
                if cv2.contourArea(cnt) < 40: 
                    continue
                
                # 🚀 [개선 2] 선 단순화 (Douglas-Peucker 알고리즘)
                # 지글지글한 점들의 모임을 팽팽한 직선으로 펴줍니다.
                # 0.001 값을 0.002로 키우면 더 단순해지고, 줄이면 더 정밀해집니다.
                epsilon = 0.001 * cv2.arcLength(cnt, True)
                approx = cv2.approxPolyDP(cnt, epsilon, True)
                
                points = approx.reshape(-1, 2)
                
                # 🚀 [개선 3] DXF에 선 그리기
                for i in range(len(points) - 1):
                    p1 = (float(points[i][0]), float(-points[i][1]))
                    p2 = (float(points[i+1][0]), float(-points[i+1][1]))
                    msp.add_line(p1, p2)
                    
                # 도형이 닫혀있다면 마지막 점과 첫 점을 연결
                if len(points) > 2:
                    msp.add_line((float(points[-1][0]), float(-points[-1][1])), 
                                (float(points[0][0]), float(-points[0][1])))

            doc.saveas(output_dxf_path)
            
            # NestJS 결과 보고
            await result_queue.add("completed", {
                "drawingId": data['drawingId'],
                "status": "COMPLETED",
                "resultUrl": output_dxf_path.replace("../backend-api/", "")
            })
            print(f"✨ [성공] 최종 DXF 저장 완료: {output_dxf_path}")

    except Exception as e:
        print(f"❌ 에러: {e}")

# 실제 이미지를 변환하는 로직이 들어갈 함수
# async def process_drawing(job, job_id):
#     print(f"\n[🔥 변환 시작] Job ID: {job_id}")
#     time.sleep(5)
#     print(f"\n[🔥🔥🔥🔥🔥 변환 시작] Job ID: {job_id}")
#     data = job.data
#     input_path = f"../backend-api/{data['filePath']}" # NestJS가 저장한 경로
#     output_dxf_path = input_path.rsplit('.', 1)[0] + ".dxf"

#     try:
#         # 1. 이미지 로드 (OpenCV)
#         img = cv2.imread(input_path)
#         if img is None:
#             raise Exception("이미지를 불러올 수 없습니다.")

#         # 2. 전처리: 그레이스케일 변환 및 이진화 (선 선명하게 따기)
#         gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
#         # 블러로 노이즈 제거 후, 적응형 임계값 처리
#         blurred = cv2.GaussianBlur(gray, (5, 5), 0)
#         thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]

#         # 3. 윤곽선(Contours) 찾기
#         contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

#         # 4. DXF 파일 생성 (캐드 데이터 쓰기)
#         doc = ezdxf.new(dxfversion="R2010")
#         msp = doc.modelspace()

#         # for cnt in contours:
#         #     # 1. 면적 필터링 (너무 작은 점/먼지 제거)
#         #     if cv2.contourArea(cnt) < 50: # 기준을 조금 더 높였습니다
#         #         continue
            
#         #     # 2. 선 팽팽하게 펴기 (Douglas-Peucker 알고리즘)
#         #     # epsilon값이 커질수록 선이 더 단순해지고 직선화됩니다.
#         #     epsilon = 0.01 * cv2.arcLength(cnt, True) 
#         #     approx = cv2.approxPolyDP(cnt, epsilon, True)

#         #     # 3. DXF에 그리기
#         #     points = approx.reshape(-1, 2)
#         #     for i in range(len(points) - 1):
#         #         p1 = (float(points[i][0]), float(-points[i][1]))
#         #         p2 = (float(points[i+1][0]), float(-points[i+1][1]))
#         #         msp.add_line(p1, p2)
            
#         #     # 마지막 점과 첫 점을 이어주기 (닫힌 도형일 경우)
#         #     msp.add_line((float(points[-1][0]), float(-points[-1][1])), 
#         #                  (float(points[0][0]), float(-points[0][1])))

#         for cnt in contours:
#             # 너무 작은 점들은 노이즈로 판단하고 무시 (면적 기준)
#             if cv2.contourArea(cnt) < 10:
#                 continue
            
#             # 윤곽선 좌표를 캐드의 LINE 데이터로 변환
#             points = cnt.reshape(-1, 2)
#             for i in range(len(points) - 1):
#                 p1 = (float(points[i][0]), float(-points[i][1])) # 캐드 좌표계 보정
#                 p2 = (float(points[i+1][0]), float(-points[i+1][1]))
#                 msp.add_line(p1, p2)

#         doc.saveas(output_dxf_path)
#         print(f"✨ DXF 생성 완료: {output_dxf_path}")

#         # 5. 결과 전송
#         await result_queue.add("completed", {
#             "drawingId": data['drawingId'],
#             "status": "COMPLETED",
#             "resultUrl": output_dxf_path.replace("../backend-api/", "") 
#         })

#     except Exception as e:
#         print(f"❌ 에러 발생: {e}")
#     # print(f"\n[🔥 작업 수신] Job ID: {job_id}")
#     # data = job.data
#     # print(f"📦 처리 데이터: {data}")
    
#     # # 도면 변환 시뮬레이션 (나중에 여기에 OpenCV 코드가 들어갑니다)
#     # print("🛠 도면 변환 시작 (OpenCV Processing...)...")
#     # await asyncio.sleep(3) # 3초간 무거운 연산을 하는 척 합니다.
    
#     # print(f"✅ 작업 완료! (Drawing ID: {data['drawingId']})")
    
#     # # 처리 결과를 반환 (NestJS에서 이 결과를 확인할 수 있습니다)
#     # return {"status": "SUCCESS", "path": data['filePath'], "timestamp": time.time()}

#     # print(f"\n[🔥 작업 수신] Job ID: {job_id}")
#     # data = job.data
    
#     # print("🛠 도면 변환 중...")
#     # await asyncio.sleep(3) # 시뮬레이션
    
#     # # 작업 완료 후 결과 큐에 데이터 넣기
#     # print(f"📢 결과 전송 중 (ID: {data['drawingId']})...")
#     # await result_queue.add("completed", {
#     #     "drawingId": data['drawingId'],
#     #     "status": "COMPLETED",
#     #     "resultUrl": f"processed_{data['filePath']}" # 가상의 결과 경로
#     # })
    
#     # print(f"✅ 작업 완료 및 결과 전송 성공!")

async def main():
    print("🚀 Drawing Engine Worker 가동 중... (Redis 감시 시작)")
    
    # 'drawing-conversion' 큐를 감시합니다.
    # NestJS에서 127.0.0.1로 성공했으니 여기서도 똑같이 맞춰줍니다.
    worker = Worker("drawing-conversion", process_drawing, {
        "connection": "redis://127.0.0.1:6379"
    })

    # 워커가 죽지 않고 계속 실행되게 유지합니다.
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
