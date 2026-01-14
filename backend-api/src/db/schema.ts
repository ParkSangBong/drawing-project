import { mysqlTable, serial, varchar, timestamp, mysqlEnum } from 'drizzle-orm/mysql-core';

// 사용자들이 업로드한 도면 정보를 담는 테이블
export const drawings = mysqlTable('drawings', {
  id: serial('id').primaryKey(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  originalUrl: varchar('original_url', { length: 500 }).notNull(), // S3나 로컬 저장 경로
  status: mysqlEnum('status', ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).default('PENDING'),
  createdAt: timestamp('created_at').defaultNow(),
});
