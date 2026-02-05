import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DrizzleService } from '../db/drizzle/drizzle.service';
import { drawings } from '../db/schema';
import { DrawingsGateway } from './drawings.gateway';
import { eq } from 'drizzle-orm';
import { ConfigService } from '@nestjs/config';

import { GoogleGenAI } from "@google/genai";
import Drawing from 'dxf-writer';
import * as fs from 'fs';
import * as path from 'path';

// 1. 공통 속성 정의
interface BaseElement {
  description?: string; // 디버깅용 설명
}

// 2. 원(Circle) 타입 정의
interface DxfCircle extends BaseElement {
  type: 'CIRCLE';
  x: number;
  y: number;
  r: number;
}

// 3. 선(Line) 타입 정의
interface DxfLine extends BaseElement {
  type: 'LINE';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// 4. 텍스트(Text) 타입 정의
interface DxfText extends BaseElement {
  type: 'TEXT';
  x: number;
  y: number;
  content: string;
  height: number;
}

// 5. 유니온 타입 (타입 안전성 확보)
type DxfElement = DxfCircle | DxfLine | DxfText;

@Injectable()
export class DrawingsService {
  private genAI: GoogleGenAI;
  private readonly logger = new Logger(DrawingsService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    @InjectQueue('drawing-conversion') private conversionQueue: Queue,
    private readonly drawingsGateway: DrawingsGateway,
    private readonly configService: ConfigService,
  ) {
    // 🛠️ API Key 설정
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      this.logger.warn('⚠️ GEMINI_API_KEY가 설정되지 않았습니다.');
    } else {
      this.genAI = new GoogleGenAI({ apiKey: apiKey });
      this.logger.log(`🔑 API Key 적용됨.`);
    }
  }

  // =================================================================
  // 🚀 [FINAL] Gemini 3 AI 변환 로직 (Smart Tracing Mode)
  // =================================================================

  async convertWithGemini(file: Express.Multer.File): Promise<any> {
    try {
      this.logger.log('🤖 Gemini 3 AI 분석 시작 (Smart Tracing Mode)...');
      
      // 1. AI가 직접 도면 요소(선, 원, 텍스트)를 생성하여 반환
      const designData = await this.analyzeImage(file.buffer);
      this.logger.log(`📊 AI 추출 요소 수: ${designData.elements.length}개`);

      // 2. DXF 파일 생성
      const dxfContent = this.createDxf(designData);
      
      // 3. 파일 저장
      const fileName = `ai_drawing_${Date.now()}.dxf`;
      const uploadDir = path.join(process.cwd(), 'uploads');
      
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const uploadPath = path.join(uploadDir, fileName);
      fs.writeFileSync(uploadPath, dxfContent);
      this.logger.log(`💾 DXF 파일 저장 완료: ${fileName}`);
      
      return {
        success: true,
        message: '변환 성공',
        dxfUrl: `/uploads/${fileName}`,
        aiData: designData // 프론트엔드 확인용
      };

    } catch (error) {
      this.logger.error(`❌ AI 변환 실패: ${error}`);
      throw new InternalServerErrorException(`AI 변환 중 오류 발생: ${error.message}`);
    }
  }

  // 👇 [핵심 변경] AI에게 좌표 생성을 전적으로 위임하는 프롬프트
  private async analyzeImage(imageBuffer: Buffer): Promise<{ elements: DxfElement[] }> {
    const base64Image = imageBuffer.toString('base64');

    const prompt = `
      Role: Expert CAD Engineer.
      Task: Convert the attached mechanical sketch into a clean, professional set of 2D DXF coordinates.
      
      [Analysis Strategy]
      1. **Identify Views**: Look for a Top View (Circle/Hexagon) and a Front View (Rectangular body).
      2. **Shape Recognition**: 
         - The sketch likely shows a "Special Nut" with a Hexagon head and a cylindrical body below it.
         - If you see "X" or cross-hatching, treat it as a solid body section. Draw the boundary box lines, and add diagonal lines inside if possible.
      3. **Text Extraction**: Find dimensions like "M10", "37", "28", "Hex 24" and place them as TEXT elements near the relevant parts.
      
      [Drafting Rules]
      - **Straighten Lines**: Convert wobbly hand-drawn lines into perfectly straight horizontal/vertical LINE elements.
      - **Perfect Circles**: Convert rough circles into perfect CIRCLE elements.
      - **Alignment**: Ensure the Top View is placed vertically ABOVE the Front View (share the same Center X).
      
      [Output JSON Structure]
      Return ONLY a JSON object with an "elements" array containing these types:
      - { "type": "CIRCLE", "x": number, "y": number, "r": number }
      - { "type": "LINE", "x1": number, "y1": number, "x2": number, "y2": number }
      - { "type": "TEXT", "x": number, "y": number, "content": string, "height": number }
    `;

    const response = await this.genAI.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: base64Image } }
          ]
        }
      ],
      config: { responseMimeType: "application/json" }
    });

    let text = response.text;
    if (!text) throw new Error('Gemini Response Empty');

    // 마크다운 제거 및 JSON 파싱
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(text);
  }

  // 👇 [수정] 타입 안전성을 적용한 DXF 생성기
  private createDxf(data: { elements: DxfElement[] }): string {
    const d = new Drawing();
    d.setUnits('Millimeters');

    if (data.elements) {
      data.elements.forEach((el) => {
        // 타입 가드(Type Guard)를 통해 안전하게 접근
        if (el.type === 'CIRCLE') {
          d.drawCircle(el.x, el.y, el.r);
        } else if (el.type === 'LINE') {
          d.drawLine(el.x1, el.y1, el.x2, el.y2);
        } else if (el.type === 'TEXT') {
          d.drawText(el.x, el.y, el.height, 0, el.content);
        }
      });
    }
    return d.toDxfString();
  }

  // =================================================================
  // 📦 [EXISTING] 기존 레거시 코드 (변경 없음)
  // =================================================================

  async requestPreview(id: number, params: any) {
    const drawing = await this.drizzle.db
      .select()
      .from(drawings)
      .where(eq(drawings.id, id))
      .then(res => res[0]);

    if (!drawing) {
      this.logger.error(`❌ [Service] 도면을 찾을 수 없습니다: ID ${id}`);
      return;
    }

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

      this.logger.log(`📡 [${params.mode}] 큐 전송 완료 (ID: ${id})`);
    } catch (error) {
      this.logger.error('❌ Redis 작업 추가 실패:', error);
    }
  }

  async updateStatus(id: number, status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED') {
    this.logger.log(`[Status Update] ID: ${id} -> ${status}`);

    await this.drizzle.db
      .update(drawings)
      .set({ status: status })
      .where(eq(drawings.id, id));

    if (status === 'COMPLETED') {
      this.logger.log(`[WebSocket] ${id}번 도면 변환 완료 신호 발송!`);
      this.drawingsGateway.sendUpdateNotification(id);
    }
  }

  async create(fileName: string, filePath: string) {
    const result = await this.drizzle.db.insert(drawings).values({
      fileName: fileName,
      originalUrl: filePath,
      status: 'PENDING',
    });
  
    const drawingId = (result as any)[0].insertId; 
    const startTime = Date.now();

    this.logger.log(`Attempting to add job to Redis: drawingId=${drawingId}`);
  
    try {
      const job = await this.conversionQueue.add('convert', {
        drawingId: drawingId,
        filePath: filePath,
        startTime,
      });
      this.logger.log(`✅ Job added to Redis successfully! Job ID: ${job.id}`);
    } catch (error) {
      this.logger.error('❌ Failed to add job to Redis:', error);
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