import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DrizzleModule } from './db/drizzle/drizzle.module';
import { DrawingsModule } from './drawings/drawings.module';

@Module({
  imports: [ 
    // Redis 연결 설정 (Docker의 dada-redis 서비스와 연결)
    BullModule.forRoot({
      connection: {
        host: '127.0.0.1',
        port: 6379,
      },
    }),
    DrizzleModule, DrawingsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}