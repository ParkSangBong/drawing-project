# 🎨 AI 도면 변환 플랫폼 (Mom Drawing Project)

어머님들이 손으로 그린 도면을 디지털 파일로 자동 변환해 주는 비동기 처리 기반의 풀스택 플랫폼입니다. 
확장성과 안정성을 고려하여 **모노레포(Monorepo)** 및 **이종 언어 간 메시지 큐(Message Queue)** 아키텍처를 채택했습니다.

---

## 🏗 시스템 아키텍처 (System Architecture)

본 프로젝트는 대용량 이미지 처리와 비즈니스 로직을 분리하기 위해 다음과 같은 구조로 설계되었습니다.



1. **Frontend (Next.js)**: 사용자 인터페이스 및 이미지 업로드 관리
2. **Backend API (NestJS)**: 비즈니스 로직 처리, DB 저장 및 작업 큐(Job Queue) 관리
3. **Message Queue (Redis/BullMQ)**: 백엔드와 파이썬 엔진 간의 비동기 통신 중재
4. **Drawing Engine (Python)**: OpenCV/AI 기반의 도면 변환 처리 (Worker)
5. **Database (MySQL)**: 도면 정보 및 변환 상태 관리

---

## 🛠 기술 스택 (Tech Stack)

### Infrastructure & Dev Tools
- **Docker**: 서비스 컨테이너화 및 인프라 통합 관리
- **Redis**: 비동기 작업 큐 (BullMQ)

### Backend (NestJS)
- **Framework**: NestJS (TypeScript)
- **ORM**: Drizzle ORM (Type-safe & Lightweight)
- **Database**: MySQL 8.0
- **API Documentation**: Swagger (OpenAPI 3.0)

### Engine (Python)
- **Library**: OpenCV, BullMQ-Python
- **Task**: 이미지 프로세싱 및 비동기 워커(Worker) 구현

---

## 🚀 시작하기 (Getting Started)

### 1. 인프라 실행 (Docker)
```bash
docker-compose up -d
```

### 2. 백엔드 설정 및 실행
```bash
cd backend-api
npm install
npx drizzle-kit push  # DB 스키마 동기화
npm run start:dev     # http://localhost:3000/api 에서 Swagger 확인 가능
```

### 3. 파이썬 엔진 실행
```bash
cd drawing-engine
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

## 💡 주요 결정 근거 (Key Engineering Decisions)
- Monorepo 구조: 프론트엔드, 백엔드, 엔진 코드를 한눈에 파악하고 관리하기 위해 채택

- 비동기 큐 도입: 도면 변환과 같은 무거운 연산이 API 응답 시간을 지연시키지 않도록 BullMQ를 통한 비동기 처리 구조 설계

- UUID 파일링: 사용자가 업로드한 원본 파일의 한글 깨짐 방지 및 보안 강화를 위해 UUID 기반 파일 시스템 구축
---