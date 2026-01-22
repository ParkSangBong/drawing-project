import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/db/schema.ts',
	out: './drizzle',
	dialect: 'mysql',
	dbCredentials: {
		// 🚀 도커 환경변수가 있으면 'db', 없으면 'localhost'를 쓰도록 설정
		host: process.env.DB_HOST || 'db', 
		port: Number(process.env.DB_PORT) || 3306,
		user: process.env.DB_USER || 'user',
		password: process.env.DB_PASSWORD || 'new_secure_password_123',
		database: process.env.DB_NAME || 'drawing_service_db',
	},
});