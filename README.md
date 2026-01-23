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
- **Infra**: Docker Compose, Nginx Proxy Manager (SSL)

## 🏗️ 시스템 아키텍처 (System Architecture)
이 프로젝트는 단일 서버 구조를 넘어, 각 서비스가 컨테이너로 격리된 마이크로서비스 지향 아키텍처로 설계되었습니다.


```graph TD
    User((사용자)) -->|HTTPS/443| NPM[Nginx Proxy Manager]
    
    subgraph "Docker Internal Network"
        NPM -->|Proxy| Front[Next.js Frontend]
        NPM -->|Proxy| Back[NestJS Backend]
        Back <--> DB[(MySQL)]
        Back <--> Redis((Redis Queue))
        Redis <--> Engine[Python Analysis Engine]
        
        Back -.->|Shared Volume| Storage[(Shared Storage)]
        Engine -.->|Shared Volume| Storage
```

## 🛡️ 인프라 및 보안 설계 상세 (Infrastructure Deep Dive)
- SSL Termination: Nginx Proxy Manager를 도입하여 Let's Encrypt 기반의 전 구간 HTTPS 암호화 통신을 구현했습니다.

- Port Minimization: 외부 개방 포트를 80(HTTP), 443(HTTPS)으로 단일화하여 공격 접점(Attack Surface)을 최소화했습니다.

- Network Isolation: DB와 Redis를 외부 노출 없이 내부 네트워크에서만 통신하도록 격리하여 인프라 보안을 강화했습니다.

## 🎯 주요 이슈 해결 (Troubleshooting Chronicle)
1. 불필요한 네트워크 부하 (Network Optimization)
    
    현상: 도면 변환 확인을 위한 3초 주기 Polling이 서버 자원 및 대역폭 낭비 초래.

    해결: WebSocket(Socket.io)을 도입하여 변환 완료 시점에만 서버가 클라이언트에게 신호를 보내도록 개선.

2. 한글 파일명 깨짐 (Encoding Issue)

    현상: Multer를 통해 전달받은 한글 파일명이 latin1으로 해석되어 깨짐 발생.

    해결: Buffer.from(file.originalname, 'latin1').toString('utf8')을 통해 원본 바이트 데이터를 UTF-8로 재구성하여 해결했습니다.

3. HTTPS 환경에서의 Mixed Content 및 CORS 이슈

    현상: SSL 적용 후 프론트엔드(HTTPS)에서 백엔드(HTTP) 호출 시 보안 정책에 의해 차단됨.

    해결: API 전용 서브도메인(api.quitelog.com)을 할당하고, NestJS main.ts에서 Dynamic Origin Whitelist 로직을 구현하여 실제 차단된 오리진을 추적하고 허용 목록에 추가했습니다.

4. 실시간 통신 및 웹소켓 최적화

    현상: 배포 환경에서 Socket.io 연결 시 404 Not Found 및 SSL_PROTOCOL_ERROR 발생.

    해결: Nginx 프록시 설정에서 Websockets Support를 활성화하고, 클라이언트 측 소켓 주소에서 포트 번호를 제거하여 도메인 기반 라우팅으로 통일했습니다.

5. 도커 컨테이너 간 "localhost" 통신 실패

    현상: 컨테이너화 이후 백엔드에서 DB 및 Redis 접속 불가 (ECONNREFUSED).

    원인: 컨테이너 내부에서 localhost는 자기 자신을 가리키며 호스트 PC를 가리키지 않음.

    해결: docker-compose.yml에 정의된 서비스 명(db, redis)을 호스트 네임으로 사용하여 도커 내장 DNS를 통해 통신하도록 수정했습니다.

## 📂 프로젝트 구조 (Project Structure)
```
.
├── backend-api/          # NestJS 기반 API 서버 (BullMQ, Socket.io)
├── frontend-web/         # Next.js 기반 대시보드 (Tailwind CSS)
├── drawing-engine/       # Python 기반 OpenCV 분석 엔진
├── npm/                  # Nginx Proxy Manager 데이터 및 인증서
└── docker-compose.yml    # 전체 서비스 오케스트레이션 설정
```

<!-- ## 🚀 시작하기 (Getting Started)

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
``` -->

## 🚀 시작하기 (Getting Started)

프로젝트는 **Docker Compose**를 통해 모든 마이크로서비스 인프라를 한 번에 가동할 수 있도록 설계되었습니다.

### 1. 환경 변수 설정
각 서비스 폴더 내의 `.env.example` 파일을 복사하여 실제 환경 변수 파일을 생성합니다.
```bash
# 루트 디렉토리에서 실행
cp backend-api/.env.example backend-api/.env
cp drawing-engine/.env.example drawing-engine/.env
cp frontend-web/.env.example frontend-web/.env.local
```

### 2. 전체 서비스 실행 (Docker)
Docker Compose를 사용하여 DB, Redis, Backend, Engine, Frontend, Nginx Proxy Manager를 한 번에 실행합니다.

```Bash
# 전체 컨테이너 빌드 및 백그라운드 실행
docker-compose up -d --build
```

### 3. 초기 데이터베이스 설정
백엔드 컨테이너가 가동되면 Drizzle ORM을 통해 스키마를 동기화합니다.

```Bash
docker exec -it drawing-service-backend npx drizzle-kit push
```

### 4. 접속 주소 확인
Frontend Dashboard: https://quitelog.com (또는 로컬 http://localhost:3001)

API Swagger: https://api.quitelog.com/api (또는 로컬 http://localhost:3000/api)

Nginx Proxy Admin: http://localhost:81

---