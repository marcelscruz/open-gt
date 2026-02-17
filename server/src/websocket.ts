import http from "node:http";
import { Server as SocketIOServer } from "socket.io";

/** Create an HTTP + Socket.IO server on the given port */
export function createWebSocketServer(port: number): SocketIOServer {
  const httpServer = http.createServer();
  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);
    socket.on("disconnect", () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
    });
  });

  httpServer.listen(port, () => {
    console.log(`[GT7] WebSocket server on port ${port}`);
  });

  return io;
}
