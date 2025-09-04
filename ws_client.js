import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:3001");

ws.on("open", () => {
  const requestId = String(Date.now());
  ws.send(JSON.stringify({
    action: "login",
    phoneNumber: "447999803105",
    waitMs: 60000,
    requestId
  }));
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  console.log("recv:", msg);
  // phase: "pairing" -> 展示配对码；phase: "final" -> 更新连接状态
});
