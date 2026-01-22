import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DrizzleModule } from './db/drizzle/drizzle.module';
import { DrawingsModule } from './drawings/drawings.module';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [ 
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
        },
      }),
      inject: [ConfigService],
    }),
    DrizzleModule, 
    DrawingsModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}