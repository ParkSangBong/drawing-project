import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DrizzleService } from '../db/drizzle/drizzle.service';
import { drawings } from '../db/schema';
import { DrawingsGateway } from './drawings.gateway';
import { eq } from 'drizzle-orm';
import { ConfigService } from '@nestjs/config';
// 👇 [추가] AI 및 파일 처리를 위한 라이브러리
import { GoogleGenerativeAI } from '@google/generative-ai';
import Drawing from 'dxf-writer';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DrawingsService {
  private genAI: GoogleGenerativeAI;

  constructor(
    private readonly drizzle: DrizzleService,
    @InjectQueue('drawing-conversion') private conversionQueue: Queue, // 큐 주입 유지
    private readonly drawingsGateway: DrawingsGateway,
    private readonly configService: ConfigService,
  ) {
    // const apiKey = this.configService.get<string>('GEMINI_API_KEY') || '';
    const apiKey = "AIzaSyAORVgdDZ91d9hx_MjmFzJ4wB2RyJ5yJIY";
    // API 키 설정 (루트 .env 파일에 GEMINI_API_KEY가 있어야 합니다)

    console.log('🔑 현재 적용된 API Key:', apiKey.substring(0, 5) + '...');

    if (!apiKey) {
      console.warn('⚠️ GEMINI_API_KEY가 설정되지 않았습니다. AI 기능이 동작하지 않을 수 있습니다.');
    }
      
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  // =================================================================
  // 🚀 [NEW] Gemini AI 변환 로직 (여기가 새로 추가된 핵심입니다)
  // =================================================================

  async convertWithGemini(file: Express.Multer.File): Promise<any> {
    try {
      console.log('🤖 Gemini AI 분석 시작...');
      
      // 1. 이미지 분석 요청
      const designData = await this.analyzeImage(file.buffer);
      console.log('📊 분석 완료! 데이터:', JSON.stringify(designData, null, 2));

      // 2. DXF 파일 생성
      const dxfContent = this.createDxf(designData);
      
      // 3. 파일 저장
      const fileName = `ai_drawing_${Date.now()}.dxf`;
      // 도커 환경의 /app/uploads 경로 확보
      const uploadDir = path.join(process.cwd(), 'uploads');
      
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir);
      }

      const uploadPath = path.join(uploadDir, fileName);
      fs.writeFileSync(uploadPath, dxfContent);
      console.log(`💾 DXF 파일 저장 완료: ${fileName}`);

      // 4. (선택사항) DB에 '완료' 상태로 기록 남기기
      // 필요하면 아래 주석을 풀어서 사용하세요.
      /*
      await this.drizzle.db.insert(drawings).values({
        fileName: fileName,
        originalUrl: `/uploads/${fileName}`,
        status: 'COMPLETED',
      });
      */
      
      return {
        success: true,
        message: '변환 성공',
        dxfUrl: `/uploads/${fileName}`,
        aiData: designData // 프론트 디버깅용
      };

    } catch (error) {
      console.error('❌ AI 변환 실패:', error);
      throw new InternalServerErrorException('AI 변환 중 오류가 발생했습니다.');
    }
  }

  // [Private] Gemini API 호출
  private async analyzeImage(imageBuffer: Buffer): Promise<any> {
    // const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });
    const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      You are an expert mechanical engineer. Analyze this technical drawing image.
      Extract geometric shapes and dimensions.
      
      Return ONLY a raw JSON object (no markdown) with this structure:
      {
        "elements": [
          { "type": "CIRCLE", "x": 0, "y": 0, "r": 10 },
          { "type": "LINE", "x1": 0, "y1": 0, "x2": 10, "y2": 0 },
          { "type": "TEXT", "x": 5, "y": 5, "content": "M10", "height": 5 }
        ]
      }
      Coordinates Guide: Assume bottom-left of the main object is (0,0).
    `;

    const imagePart = {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType: 'image/jpeg',
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    let text = response.text();

    // 마크다운 제거
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  }

  // [Private] DXF 생성
  private createDxf(data: any): string {
    const d = new Drawing();
    d.setUnits('Millimeters');

    if (data.elements) {
      data.elements.forEach((el: any) => {
        if (el.type === 'CIRCLE') d.drawCircle(el.x, el.y, el.r);
        else if (el.type === 'LINE') d.drawLine(el.x1, el.y1, el.x2, el.y2);
        else if (el.type === 'TEXT') d.drawText(el.x, el.y, el.height, 0, el.content);
      });
    }
    return d.toDxfString();
  }

  // =================================================================
  // 📦 [EXISTING] 기존 코드 (파이썬 엔진 연결용 - 유지)
  // =================================================================

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
      const startTime = Date.now();
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