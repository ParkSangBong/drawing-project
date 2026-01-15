import { Injectable, OnModuleInit } from '@nestjs/common';
import { drizzle, MySql2Database } from 'drizzle-orm/mysql2';
import * as mysql from 'mysql2/promise';
import * as schema from '../schema';

@Injectable()
export class DrizzleService implements OnModuleInit {
  public db: MySql2Database<typeof schema>;

  async onModuleInit() {
    // 1. 커넥션 풀 생성
    const connection = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'root_password',
      database: 'drawing_service_db',
      charset: 'utf8mb4',
    });

    // 2. Drizzle 인스턴스 초기화
    this.db = drizzle(connection, { schema, mode: 'default' });
    console.log('Drizzle ORM이 MySQL에 연결되었습니다.');
  }
}