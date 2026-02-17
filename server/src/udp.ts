import dgram from "node:dgram";
import os from "node:os";
import { GT7_RECV_PORT, GT7_SEND_PORT } from "@opengt/shared/constants";

/** Calculate broadcast addresses from all IPv4 network interfaces */
export function getBroadcastAddresses(): string[] {
  const addresses: string[] = [];
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const info of iface) {
      if (info.family === "IPv4" && !info.internal && info.netmask) {
        const ip = info.address.split(".").map(Number);
        const mask = info.netmask.split(".").map(Number);
        const broadcast = ip.map((octet, i) => octet | (~mask[i] & 0xff)).join(".");
        addresses.push(broadcast);
      }
    }
  }
  return addresses.length > 0 ? addresses : ["255.255.255.255"];
}

/** Create and bind a UDP socket on the telemetry receive port */
export function createUdpSocket(
  onMessage: (msg: Buffer, rinfo: dgram.RemoteInfo) => void,
): dgram.Socket {
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

  socket.on("message", onMessage);

  socket.bind(GT7_RECV_PORT, () => {
    socket.setBroadcast(true);
    console.log(`[GT7] UDP listening on port ${GT7_RECV_PORT} (broadcast enabled)`);
  });

  return socket;
}

/** Start sending heartbeat packets to PS5 targets at the given interval */
export function startHeartbeat(
  socket: dgram.Socket,
  getTargets: () => string[],
  intervalMs: number,
): NodeJS.Timeout {
  const hb = Buffer.from("A");

  function send() {
    for (const target of getTargets()) {
      socket.send(hb, GT7_SEND_PORT, target, (err) => {
        if (err) console.error(`[GT7] Heartbeat error (${target}):`, err.message);
      });
    }
  }

  send();
  return setInterval(send, intervalMs);
}
