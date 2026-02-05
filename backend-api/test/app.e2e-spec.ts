import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest'; // 'import request from' 대신 '*' 사용 확인
import { AppModule } from './../src/app.module';
import { ZodValidationPipe } from 'nestjs-zod';
import { DrizzleService } from '../src/db/drizzle/drizzle.service';
import { getQueueToken } from '@nestjs/bullmq';
import { DrawingResultsProcessor } from '../src/drawings/drawings.processor';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  // 1. 가짜 DB 서비스 (실제 연결 시도 방지)
  const mockDrizzleService = {
    onModuleInit: jest.fn().mockResolvedValue(undefined), // DB 연결 시도 무력화
    db: {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
    },
  };

  // 2. 가짜 큐 객체 (Redis 연결 시도 방지)
  const mockQueue = {
    add: jest.fn(),
    emit: jest.fn(),
    on: jest.fn(),
    client: { quit: jest.fn() },
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // 3. DB 서비스 모킹
      .overrideProvider(DrizzleService)
      .useValue(mockDrizzleService)
      // 4. 모든 BullMQ 큐 모킹
      .overrideProvider(getQueueToken('drawing-conversion'))
      .useValue(mockQueue)
      .overrideProvider(getQueueToken('drawing-results'))
      .useValue(mockQueue)
      // 5. [중요] 실제 Worker가 생성되는 Processor를 빈 객체로 대체
      .overrideProvider(DrawingResultsProcessor)
      .useValue({}) 
      .compile();

    app = moduleFixture.createNestApplication();
    
    // Zod 파이프 적용
    app.useGlobalPipes(new ZodValidationPipe());
    
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('❌ [Zod 테스트] fileName 없이 업로드하면 400 에러가 나야 한다', async () => {
    const response = await request(app.getHttpServer())
      .post('/drawings/upload')
      .attach('file', Buffer.from('test-content'), 'test.jpg'); 

    // 결과 확인
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Validation failed');
  });
});