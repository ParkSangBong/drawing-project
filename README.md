# 🎨 실시간 손도면 캐드 변환 플랫폼 (Drawing to CAD)

어머님의 설계 작업을 돕기 위해 시작된, 수기 도면을 디지털 벡터 데이터로 변환하는 실시간 웹 서비스입니다.

## 🚀 주요 성과 (Key Achievements)

### 1. 실시간 비동기 아키텍처 구축
- **WebSocket (Socket.io)**: Polling 방식을 제거하고 서버 푸시 기술을 도입하여 변환 완료 시 0초 지연 알림 구현.
- **BullMQ & Redis**: NestJS와 Python 엔진 간의 작업 큐를 관리하여 안정적인 분산 처리 환경 구축.

### 2. 이미지 처리 및 벡터화 엔진 (Python & OpenCV)
- **Adaptive Thresholding**: 조명 및 배경 노이즈(격자 무늬 등)를 효과적으로 제거하는 알고리즘 적용.
- **Buffer-based Encoding**: 웹 환경에서 발생하는 한글 파일명 깨짐 문제를 바이너리 버퍼 변환으로 완벽 해결.

### 3. 사용자 중심 UI/UX
- **Interactive Preview**: 파일 업로드 즉시 브라우저 내 미리보기 제공.
- **Dark Mode Dashboard**: 장시간 작업 시 피로도를 줄이기 위한 다크 테마 및 실시간 상태 스피너 적용.

## 🛠 Tech Stack
- **Frontend**: Next.js, TypeScript, Socket.io-client
- **Backend**: NestJS, Drizzle ORM, BullMQ, Socket.io
- **Engine**: Python, OpenCV, Redis
- **Database**: MySQL (utf8mb4 환경 최적화)

## 🎯 차별화 포인트 (Problem Solving)
- **한글 인코딩 트러블슈팅**: Multer의 latin1 인코딩 한계를 `Buffer.from(name, 'latin1').toString('utf8')`로 해결한 과정 기록.
- **서버 자원 최적화**: 무의미한 HTTP 요청을 줄이기 위해 이벤트 기반 아키텍처로 고도화.

## 🚀 시작하기 (Getting Started)

### 1. 인프라 실행 (Docker)
Redis와 MySQL을 도커로 간편하게 실행합니다.
```Bash
docker-compose up -d
```

### 2. 백엔드 설정 및 실행 (NestJS)
```Bash
cd backend-api
npm install

# .env 설정 (DB 연결 정보 및 Redis 정보 입력)
cp .env.example .env 

npx drizzle-kit push  # DB 스키마 동기화
npm run start:dev     # 서버 실행 (Swagger: http://localhost:3000/api)
```

### 3. 프론트엔드 설정 및 실행 (Next.js)
```Bash

cd frontend-web
npm install

# .env.local 설정 (API 및 WebSocket 주소 입력)
npm run dev           # 대시보드 접속: http://localhost:3001
```

### 4. 파이썬 엔진 실행 (OpenCV/BullMQ)
```Bash
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  
cd drawing-engine
# 가상환경 구축 및 라이브러리 설치
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

python main.py        # 엔진 가동 및 작업 대기
```

## 🏗️ 시스템 아키텍처 (System Architecture)
이 프로젝트의 핵심인 데이터 흐름을 한눈에 파악할 수 있는 구조입니다.

Client: Next.js (File Upload & Real-time Update)

API Server: NestJS (Job Queueing & DB Management)

Message Broker: Redis & BullMQ (Async Task Management)

Worker: Python Engine (OpenCV Image Processing)

Real-time: Socket.io (Server-to-Client Notification)

## 🛠️ 주요 이슈 해결 (Troubleshooting)
1. 한글 파일명 깨짐 (Encoding Issue)
- 현상: Multer를 통해 전달받은 한글 파일명이 latin1으로 해석되어 깨짐 발생.

- 해결: Buffer.from(file.originalname, 'latin1').toString('utf8')을 통해 원본 바이트 데이터를 UTF-8로 재구성하여 해결.

2. 불필요한 네트워크 부하 (Network Optimization)
- 현상: 도면 변환 확인을 위한 3초 주기 Polling이 서버 자원 및 대역폭 낭비 초래.

- 해결: **WebSocket(Socket.io)**을 도입하여 변환 완료 시점에만 서버가 클라이언트에게 신호를 보내도록 개선.