const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// "연결 코드"(pairKey) 단위로 방을 나눔.
// 교사용 앱과 교실용 앱이 같은 pairKey를 쓰면 서로 연결됨.
// 같은 서버를 여러 학급이 나눠 써도 코드가 다르면 서로 섞이지 않음.

io.on('connection', (socket) => {
  socket.on('join', ({ pairKey, role }) => {
    if (!pairKey) return;
    socket.join(`pair-${pairKey}`);
    socket.data.pairKey = pairKey;
    socket.data.role = role;
    console.log(`[연결] ${socket.id} (${role}) -> pair-${pairKey}`);

    // 교실 앱이 붙으면 교사 앱에게 "연결됨" 상태를 알려줌
    io.to(`pair-${pairKey}`).emit('presence', { role, online: true });
  });

  socket.on('urgent-message', ({ pairKey, text }) => {
    if (!pairKey || !text) return;
    const payload = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      time: Date.now(),
    };
    io.to(`pair-${pairKey}`).emit('urgent-message', payload);
    console.log(`[발송] pair-${pairKey} <- "${text}"`);
  });

  socket.on('ack', ({ pairKey, messageId }) => {
    io.to(`pair-${pairKey}`).emit('ack-broadcast', { messageId, time: Date.now() });
    console.log(`[확인됨] pair-${pairKey} / messageId=${messageId}`);
  });

  socket.on('disconnect', () => {
    if (socket.data.pairKey) {
      io.to(`pair-${socket.data.pairKey}`).emit('presence', { role: socket.data.role, online: false });
    }
    console.log(`[연결 종료] ${socket.id}`);
  });
});

// 무료 호스팅(Render 등)에서 슬립 방지용 헬스체크
app.get('/healthz', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`서버 실행 중: 포트 ${PORT}`));
