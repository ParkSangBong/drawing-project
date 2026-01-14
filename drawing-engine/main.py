import asyncio
from bullmq import Worker
import time

# 실제 이미지를 변환하는 로직이 들어갈 함수
async def process_drawing(job, job_id):
    print(f"\n[🔥 작업 수신] Job ID: {job_id}")
    data = job.data
    print(f"📦 처리 데이터: {data}")
    
    # 도면 변환 시뮬레이션 (나중에 여기에 OpenCV 코드가 들어갑니다)
    print("🛠 도면 변환 시작 (OpenCV Processing...)...")
    await asyncio.sleep(3) # 3초간 무거운 연산을 하는 척 합니다.
    
    print(f"✅ 작업 완료! (Drawing ID: {data['drawingId']})")
    
    # 처리 결과를 반환 (NestJS에서 이 결과를 확인할 수 있습니다)
    return {"status": "SUCCESS", "path": data['filePath'], "timestamp": time.time()}

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
