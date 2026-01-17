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

  // 기존의 개별 인자 방식에서 params 객체 방식으로 변경
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
      await this.conversionQueue.add('convert', {
        drawingId: id,
        filePath: drawing.originalUrl,
        // 🚀 핵심: 프론트에서 보낸 모든 슬라이더 값(blockSize, cValue, lineThresh, minDist, circleParam, mode)을 
        // 스프레드 연산자로 한꺼번에 담습니다.
        ...params 
      }, { 
        // 동일 도면의 미리보기 요청이 쌓이지 않도록 jobId 관리
        // Date.now()를 빼면 동일 모드/ID에 대해 큐에서 중복을 더 엄격히 방지할 수 있습니다.
        jobId: `${params.mode}-${id}`, 
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