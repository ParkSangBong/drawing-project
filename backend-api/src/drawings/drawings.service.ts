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

  // async create(fileName: string, filePath: string) {
  //   // 1. DB에 정보 저장
  //   const [result] = await this.drizzle.db.insert(drawings).values({
  //     fileName: fileName,
  //     originalUrl: filePath,
  //     status: 'PENDING',
  //   });

  //   // 2. Redis 큐에 변환 작업 추가 (id값을 같이 보냄)
  //   await this.conversionQueue.add('convert', {
  //     drawingId: result.insertId,
  //     filePath: filePath,
  //   });

  //   return { 
  //     success: true, 
  //     message: '도면 접수 및 변환 작업이 대기열에 추가되었습니다.',
  //     drawingId: result.insertId 
  //   };
  // }

  async requestPreview(id: number, blockSize: number, cValue: number) {
    // DB에서 원본 파일 경로를 가져와야 파이썬이 처리할 수 있습니다.
    const drawing = await this.drizzle.db
      .select()
      .from(drawings)
      .where(eq(drawings.id, id))
      .then(res => res[0]);
  
    if (!drawing) return;
  
    // 파이썬 엔진(BullMQ)에 작업 추가
    await this.conversionQueue.add('convert', {
      drawingId: id,
      filePath: drawing.originalUrl,
      blockSize: blockSize,
      cValue: cValue,
      mode: 'PREVIEW' // 핵심: 파이썬이 빠르게 이미지만 만들게 함
    }, { 
      jobId: `preview-${id}`, // 동일 도면의 미리보기 요청은 덮어쓰거나 관리하기 위함
      removeOnComplete: true 
    });
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
  
    // 중요: insertId가 어디에 담겨있는지 콘솔로 확인
    console.log('DB Insert Result:', result);
    
    // result[0].insertId 가 일반적인 구조입니다.
    const drawingId = (result as any)[0].insertId; 
  
    // 2. Redis에 넣기 전 로그
    console.log(`Attempting to add job to Redis: drawingId=${drawingId}`);
  
    try {
      const job = await this.conversionQueue.add('convert', {
        drawingId: drawingId,
        filePath: filePath,
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

/*
async create(fileName: string, filePath: string) {
  // 1. DB 저장
  const result = await this.drizzle.db.insert(drawings).values({
    fileName: fileName,
    originalUrl: filePath,
    status: 'PENDING',
  });

  // 중요: insertId가 어디에 담겨있는지 콘솔로 확인
  console.log('DB Insert Result:', result);
  
  // result[0].insertId 가 일반적인 구조입니다.
  const drawingId = (result as any)[0].insertId; 

  // 2. Redis에 넣기 전 로그
  console.log(`Attempting to add job to Redis: drawingId=${drawingId}`);

  try {
    const job = await this.conversionQueue.add('convert', {
      drawingId: drawingId,
      filePath: filePath,
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
*/