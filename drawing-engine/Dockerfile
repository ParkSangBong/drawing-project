FROM python:3.11-slim
# Tesseract 및 OpenCV 의존성 라이브러리 설치
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# .env의 TESSERACT_PATH는 컨테이너 내부 경로인 /usr/bin/tesseract로 자동 인식됩니다.
CMD ["python", "main.py"]