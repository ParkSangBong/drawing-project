import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
  } from '@nestjs/websockets';
  import { Server, Socket } from 'socket.io';
  
  @WebSocketGateway({
    cors: {
      origin: '*', // 실무에서는 프론트엔드 주소만 허용하는 것이 좋습니다.
    },
  })
  export class DrawingsGateway implements OnGatewayConnection, OnGatewayDisconnect {
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
  }