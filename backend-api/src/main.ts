import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);  
    const configService = app.get(ConfigService); // 추가

    const rawFrontendUrls = configService.get('FRONTEND_URL') || 'http://localhost:3001';
    const allowedOrigins = rawFrontendUrls.split(',');

    app.enableCors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            } else {
            callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
    });

    app.useStaticAssets(join(process.cwd(), 'uploads'), {
        prefix: '/uploads',
    });

    console.log(`🚀 정적 파일 경로: ${join(process.cwd(), 'uploads')}`);

    const config = new DocumentBuilder()
        .setTitle('Drawing Service Project API')
        .setDescription('도면 변환 플랫폼 API 명세서')
        .setVersion('1.0')
        .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);

    const port = configService.get('PORT') || 3000;
    await app.listen(port);
    console.log(`🚀 서버가 ${port}번 포트에서 가동 중입니다.`);
}
bootstrap();