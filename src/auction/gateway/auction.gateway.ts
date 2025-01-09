import { Logger, OnModuleInit } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from 'src/prisma/prisma.service';

@WebSocketGateway({ cors: true })
export class AuctionWebSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  constructor(
    private authService: AuthService,
    private prismaService: PrismaService,
  ) {}

  @WebSocketServer()
  server: Server;
  private logger: Logger = new Logger('AuctionWebSocketGateway');

  onModuleInit() {
    this.logger.log('AuctionWebSocketGateway Initialized ...');
  }
  handleDisconnect(socket: Socket) {
    socket.disconnect();
  }
  private disconnect(socket: Socket) {
    socket.disconnect();
  }
  async handleConnection(socket: Socket, ...args: any[]) {
    const { userId } = socket.handshake.query;
    // console.log(`auction connected: ${socket.id} with auctionId: ${auctionId}`);

    socket.join(String(userId));

    if (socket.handshake.headers['authorization']) {
      const userPayload = this.authService.authenticateSocketUser(socket);
      if (!userPayload?.id) return;

      const user = await this.prismaService.user.findUnique({
        where: { id: userPayload.id },
      });

      if (user) {
        // Inject user into socket
        socket.data.user = user;
        // Update SocketId
        await this.prismaService.user.update({
          where: { id: userPayload.id },
          data: { socketId: socket.id },
        });
      } else {
        this.disconnect(socket);
      }
    }
  }

  listingNewAuction(auction: any) {
    // Send new listed auction  to all listener sockets (users)
    this.server.emit('auction:newAuctionListed', { auction });
  }
  cancelAuction(auctionId: any) {
    //emit cancelled auction event
    this.server.emit('auction:cancelled', { auctionId });
  }
}
