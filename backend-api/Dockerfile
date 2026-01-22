FROM node:20-alpine
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# 🚀 [진단용] 빌드 후 실제 dist 구조를 로그에 찍어 확인합니다.
# nodenext 설정 시 dist/src/main.js에 생기는 경우가 많습니다.
RUN ls -R dist

EXPOSE 3000

# 🚀 [수정] dist/main.js가 없다면 dist/src/main.js를 시도하도록 실행 명령 변경
# 우선 가장 유력한 dist/src/main.js 경로를 명시해 봅니다.
CMD ["npm", "run", "deploy"]