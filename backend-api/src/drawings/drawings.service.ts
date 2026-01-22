import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DrizzleService } from '../db/drizzle/drizzle.service';
import { drawings } from '../db/schema';
import { DrawingsGateway } from './drawings.gateway';
import { eq } from 'drizzle-orm';

@Injectable()
export class DrawingsService {
  constructor(
    private readonly drizzle: DrizzleService,
    @InjectQueue('drawing-conversion') private conversionQueue: Queue, // 큐 주입
    private readonly drawingsGateway: DrawingsGateway,
  ) {}

  async requestPreview(id: number, params: any) {
    // 1. DB에서 도면 정보 조회
    const drawing = await this.drizzle.db
      .select()
      .from(drawings)
      .where(eq(drawings.id, id))
      .then(res => res[0]);

    if (!drawing) {
      console.error(`❌ [Service] 도면을 찾을 수 없습니다: ID ${id}`);
      return;
    }

    // 2. Redis 큐에 변환 작업 추가
    try {
      const startTime = Date.now(); // 🚀 시작 시간 기록
      await this.conversionQueue.add('convert', {
        drawingId: id,
        filePath: drawing.originalUrl,
        startTime,
        ...params 
      }, { 
        jobId: `${params.mode}-${id}-${startTime}`, 
        removeOnComplete: true 
      });

      console.log(`📡 [${params.mode}] 큐 전송 완료 (ID: ${id})`);
    } catch (error) {
      console.error('❌ Redis 작업 추가 실패:', error);
    }
  }

  async updateStatus(id: number, status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED') {
    console.log(`[Status Update] ID: ${id} -> ${status}`);

    await this.drizzle.db
      .update(drawings)
      .set({ status: status })
      .where(eq(drawings.id, id));

    if (status === 'COMPLETED') {
      console.log(`[WebSocket] ${id}번 도면 변환 완료 신호 발송!`);
      this.drawingsGateway.sendUpdateNotification(id);
    }
  }

  async create(fileName: string, filePath: string) {
    // 1. DB 저장
    const result = await this.drizzle.db.insert(drawings).values({
      fileName: fileName,
      originalUrl: filePath,
      status: 'PENDING',
    });
  
    console.log('DB Insert Result:', result);
    
    const drawingId = (result as any)[0].insertId; 
    const startTime = Date.now();

    // 2. Redis에 넣기 전 로그
    console.log(`Attempting to add job to Redis: drawingId=${drawingId}`);
  
    try {
      const job = await this.conversionQueue.add('convert', {
        drawingId: drawingId,
        filePath: filePath,
        startTime,
      });
      console.log('✅ Job added to Redis successfully! Job ID:', job.id);
    } catch (error) {
      console.error('❌ Failed to add job to Redis:', error);
    }
  
    return { 
      success: true, 
      message: '도면 접수 및 변환 작업이 대기열에 추가되었습니다.',
      drawingId: drawingId 
    };
  }

  async findAll() {
    return await this.drizzle.db.select().from(drawings);
  }
}