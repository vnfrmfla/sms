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

// pairKey별로 teacher/classroom 소켓이 지금 붙어있는지 서버가 기억함.
// (이걸 기억하지 않으면, 나중에 접속한 쪽이 "상대방이 이미 연결돼 있다"는
//  사실을 영영 알 수 없는 문제가 있었음 - 그래서 "대기 중"이 안 풀렸던 것)
const pairRooms = new Map(); // pairKey -> { teacher: socketId|null, classroom: socketId|null }

function getRoom(pairKey) {
  if (!pairRooms.has(pairKey)) pairRooms.set(pairKey, { teacher: null, classroom: null });
  return pairRooms.get(pairKey);
}

io.on('connection', (socket) => {
  socket.on('join', ({ pairKey, role }) => {
    if (!pairKey || !role) return;
    socket.join(`pair-${pairKey}`);
    socket.data.pairKey = pairKey;
    socket.data.role = role;

    const room = getRoom(pairKey);
    room[role] = socket.id;
    console.log(`[연결] ${socket.id} (${role}) -> pair-${pairKey}`);

    // 1) 방 전체에 "이 역할이 지금 온라인이다"라고 알림
    io.to(`pair-${pairKey}`).emit('presence', { role, online: true });

    // 2) 방금 들어온 소켓에게는, 상대방이 이미 접속해 있는지 현재 상태를 바로 알려줌
    //    (상대방이 먼저 켜져 있었어도 놓치지 않도록)
    const otherRole = role === 'teacher' ? 'classroom' : 'teacher';
    socket.emit('presence', { role: otherRole, online: !!room[otherRole] });
  });

  socket.on('urgent-message', ({ pairKey, text, messageId }) => {
    if (!pairKey || !text) return;
    const payload = {
      id: messageId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      time: Date.now(),
    };
    io.to(`pair-${pairKey}`).emit('urgent-message', payload);
    console.log(`[발송] pair-${pairKey} <- "${text}" (id=${payload.id})`);
  });

  socket.on('ack', ({ pairKey, messageId }) => {
    io.to(`pair-${pairKey}`).emit('ack-broadcast', { messageId, time: Date.now() });
    console.log(`[확인됨] pair-${pairKey} / messageId=${messageId}`);
  });

  socket.on('disconnect', () => {
    const { pairKey, role } = socket.data;
    if (pairKey && role) {
      const room = getRoom(pairKey);
      // 재연결 등으로 이미 다른 소켓이 같은 role을 차지했다면 지우지 않음
      if (room[role] === socket.id) {
        room[role] = null;
        io.to(`pair-${pairKey}`).emit('presence', { role, online: false });
      }
    }
    console.log(`[연결 종료] ${socket.id}`);
  });
});

// 무료 호스팅(Render 등)에서 슬립 방지용 헬스체크
app.get('/healthz', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`서버 실행 중: 포트 ${PORT}`));
