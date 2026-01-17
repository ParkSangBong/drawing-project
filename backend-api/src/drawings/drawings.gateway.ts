import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    MessageBody,
    SubscribeMessage,
  } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DrawingsService } from './drawings.service';
import { forwardRef, Inject } from '@nestjs/common';
  
  @WebSocketGateway({
    cors: {
      origin: '*', // 실무에서는 프론트엔드 주소만 허용하는 것이 좋습니다.
    },
  })
  export class DrawingsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    constructor(
      @Inject(forwardRef(() => DrawingsService))
      private readonly drawingsService: DrawingsService
    ) {}
    
    @WebSocketServer()
    server: Server;
  
    // 클라이언트가 연결되었을 때
    handleConnection(client: Socket) {
      console.log(`클라이언트 연결됨: ${client.id}`);
    }
  
    // 클라이언트 연결이 끊겼을 때
    handleDisconnect(client: Socket) {
      console.log(`클라이언트 연결 끊김: ${client.id}`);
    }
  
    // 특정 작업 완료 알림을 모든 클라이언트에게 전송하는 함수
    sendUpdateNotification(drawingId: number) {
      this.server.emit('drawingUpdated', { id: drawingId });
    }

    @SubscribeMessage('adjustParameters')
    async handleAdjustParameters(@MessageBody() data: any) {
      // 1. 로그를 통해 모든 파라미터가 잘 오는지 확인 (디버깅용)
      console.info('📥 수신된 전체 파라미터:', data);

      // 2. data 객체 전체를 서비스로 넘깁니다. 
      // (인자를 하나씩 나열하지 않아도 되므로 코드가 훨씬 간결해집니다)
      await this.drawingsService.requestPreview(
        data.drawingId,
        data // 여기서 모든 파라미터(blockSize, cValue, lineThresh, minDist, circleParam, mode)가 담긴 객체를 보냅니다.
      );
    }
  }