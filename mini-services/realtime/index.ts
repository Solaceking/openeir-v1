// OpenEir — realtime service (socket.io)
// Port 3030: socket.io client connections (via gateway, path '/')
// Port 3031: internal control HTTP — POST /emit from the Next.js orchestrator
import { createServer } from 'http'
import { Server } from 'socket.io'

// ---- client-facing socket.io server (port 3030) ----
const socketHttp = createServer()
const io = new Server(socketHttp, {
  // DO NOT change the path, it is used by the gateway to forward requests
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.on('connection', (socket) => {
  socket.emit('hello', { at: new Date().toISOString(), message: 'Eir is listening.' })
  socket.on('ping-server', (cb) => {
    if (typeof cb === 'function') cb({ pong: Date.now() })
  })
})

// ---- internal control server (port 3031, never exposed) ----
const control = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/emit') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      try {
        const { channel, payload } = JSON.parse(body)
        io.emit(String(channel ?? 'event'), payload)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, clients: io.engine.clientsCount }))
      } catch {
        res.writeHead(400); res.end(JSON.stringify({ ok: false }))
      }
    })
    return
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, clients: io.engine.clientsCount }))
    return
  }
  res.writeHead(404); res.end()
})

socketHttp.listen(3030, () => console.log('OpenEir realtime (socket.io) on :3030'))
control.listen(3031, '127.0.0.1', () => console.log('OpenEir realtime control on :3031 (internal)'))

process.on('SIGTERM', () => { socketHttp.close(); control.close(); process.exit(0) })
process.on('SIGINT', () => { socketHttp.close(); control.close(); process.exit(0) })
