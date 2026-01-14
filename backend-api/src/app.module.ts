import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DrizzleModule } from './db/drizzle/drizzle.module';
import { DrawingsModule } from './drawings/drawings.module';

@Module({
  imports: [DrizzleModule, DrawingsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
