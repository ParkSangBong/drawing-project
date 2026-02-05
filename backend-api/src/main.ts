import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { ZodValidationPipe } from 'nestjs-zod';

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);  
    const configService = app.get(ConfigService); // 추가

    const rawFrontendUrls = configService.get('FRONTEND_URL') || 'http://localhost:3001';
    const allowedOrigins = rawFrontendUrls.split(',');

    app.useGlobalPipes(new ZodValidationPipe());

    app.enableCors({
        origin: (origin, callback) => {
            // 1. 로컬 접속이나 origin이 없는 경우(소켓 내부 호출 등) 허용
            if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            } else {
            console.log("차단된 오리진:", origin); // 여기서 어떤 주소가 차단되는지 로그로 확인 가능합니다!
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