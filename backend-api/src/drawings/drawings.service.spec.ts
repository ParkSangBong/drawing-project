import { Test, TestingModule } from '@nestjs/testing';
import { DrawingsService } from './drawings.service';
import { DrizzleService } from '../db/drizzle/drizzle.service';
import { DrawingsGateway } from './drawings.gateway';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import * as fs from 'fs';

// 1. [Mocking] Gemini AI
jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({
          response: {
            text: jest.fn().mockReturnValue('```json\n{ "elements": [{"type":"CIRCLE", "x":0, "y":0, "r":10}] }\n```'),
          },
        }),
      }),
    })),
  };
});

// 2. [Mocking] 파일 시스템(fs)
jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
}));

describe('DrawingsService', () => {
  let service: DrawingsService;
  
  // 3. [Mocking] Drizzle ORM (여기가 수정된 핵심!)
  // 모든 체이닝 메서드가 '자기 자신(this)'을 반환하다가,
  // 마지막에 실행되는 메서드(where, values 등)가 'Promise(결과값)'를 반환하도록 설정
  const mockDb = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    
    // insert 실행 시: { insertId: 1 } 반환
    values: jest.fn().mockResolvedValue([{ insertId: 1 }]),
    
    // select/update의 조건절(where) 실행 시: 기본적으로 '도면 있음' 반환
    where: jest.fn().mockResolvedValue([{ 
      originalUrl: 'test.jpg', 
      status: 'PENDING' 
    }]),
  };

  const mockDrizzleService = {
    db: mockDb,
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job_123' }),
  };

  const mockGateway = {
    sendUpdateNotification: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'GEMINI_API_KEY') return 'TEST_API_KEY_12345';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DrawingsService,
        { provide: DrizzleService, useValue: mockDrizzleService },
        { provide: getQueueToken('drawing-conversion'), useValue: mockQueue },
        { provide: DrawingsGateway, useValue: mockGateway },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<DrawingsService>(DrawingsService);
    
    // Mock 상태 초기화 (호출 횟수 등 리셋)
    jest.clearAllMocks();
  });

  it('✅ 서비스가 정의되어 있어야 한다', () => {
    expect(service).toBeDefined();
  });

  // =================================================================
  // 🧪 테스트 그룹 1: AI 기능 (Gemini)
  // =================================================================
  describe('convertWithGemini (AI 변환)', () => {
    it('이미지 파일을 받으면 분석 후 DXF 파일 경로를 반환해야 한다', async () => {
      const mockFile = {
        buffer: Buffer.from('fake-image-data'),
        originalname: 'test.jpg',
      } as Express.Multer.File;

      const result = await service.convertWithGemini(mockFile);

      expect(result.success).toBe(true);
      expect(result.dxfUrl).toContain('.dxf');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('API 키가 없으면 경고를 출력해야 한다', () => {
      jest.spyOn(mockConfigService, 'get').mockReturnValue(null);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      new DrawingsService(
        mockDrizzleService as any,
        mockQueue as any,
        mockGateway as any,
        mockConfigService as any
      );

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('GEMINI_API_KEY'));
    });
  });

  // =================================================================
  // 🧪 테스트 그룹 2: DB 및 큐 로직
  // =================================================================
  describe('create', () => {
    it('DB에 저장하고 Redis 큐에 작업을 추가해야 한다', async () => {
      await service.create('test.jpg', '/path');
      
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalled();
    });
  });

  describe('requestPreview', () => {
    it('존재하는 도면 ID면 Redis 큐에 작업을 추가해야 한다', async () => {
      // where가 기본적으로 데이터를 반환하므로 성공 케이스
      await service.requestPreview(1, { mode: 'retry' });
      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('도면이 존재하지 않으면 Redis에 추가하지 않고 종료해야 한다', async () => {
      // 💥 여기서 Mock의 동작을 잠깐 바꿉니다! (빈 배열 반환 = 데이터 없음)
      mockDb.where.mockResolvedValueOnce([]); 

      await service.requestPreview(999, {});

      // 큐에 추가되지 않았는지 확인
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('상태를 업데이트하고 DB에 반영해야 한다', async () => {
      // update -> set -> where 체이닝이 mockDb 설정 덕분에 잘 동작함
      await service.updateStatus(1, 'PROCESSING');
      
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith({ status: 'PROCESSING' });
    });

    it('상태가 COMPLETED라면 웹소켓 알림을 보내야 한다', async () => {
      await service.updateStatus(1, 'COMPLETED');
      expect(mockGateway.sendUpdateNotification).toHaveBeenCalledWith(1);
    });

    it('상태가 COMPLETED가 아니라면 웹소켓 알림을 보내지 않아야 한다', async () => {
      await service.updateStatus(1, 'PROCESSING');
      expect(mockGateway.sendUpdateNotification).not.toHaveBeenCalled();
    });
  });
});