import { Injectable } from '@nestjs/common';
import { DrizzleService } from '../db/drizzle/drizzle.service';
import { drawings } from '../db/schema';

@Injectable()
export class DrawingsService {
  constructor(private readonly drizzle: DrizzleService) {}

  async create(fileName: string, filePath: string) {
    // DB에 업로드된 파일 정보 기록
    console.info('filePath : ', filePath)
    const result = await this.drizzle.db.insert(drawings).values({
      fileName: fileName,
      originalUrl: filePath, // 지금은 로컬 경로 저장 (나중에 S3 등으로 확장 가능)
      status: 'PENDING',
    });
    
    return { success: true, message: '도면이 성공적으로 접수되었습니다.' };
  }

  async findAll() {
    return await this.drizzle.db.select().from(drawings);
  }
}