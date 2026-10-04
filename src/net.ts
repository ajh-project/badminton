// 폰끼리 온라인 대전: WebRTC로 기기끼리 직접 연결 (처음 연결할 때만 PeerJS 공개 중계 서버 사용)

import Peer, { type DataConnection } from 'peerjs'

const PREFIX = 'ajh-badminton-'
// 헷갈리는 글자(0/O, 1/I/L) 뺀 방 코드
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export type NetStatus = 'idle' | 'waiting' | 'connecting' | 'connected' | 'error' | 'closed'

export class Online {
  role: 'host' | 'guest' | null = null
  code = ''
  status: NetStatus = 'idle'
  private peer: Peer | null = null
  private conn: DataConnection | null = null

  onMessage: (msg: any) => void = () => {}
  onStatus: (status: NetStatus, text: string) => void = () => {}

  get connected() {
    return this.status === 'connected'
  }

  private set(status: NetStatus, text: string) {
    this.status = status
    this.onStatus(status, text)
  }

  /** 방 만들기: 방 코드를 돌려줌 */
  host(): Promise<string> {
    this.close()
    this.role = 'host'
    return new Promise((resolve, reject) => {
      const tryOpen = (attempt: number) => {
        this.code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')
        const peer = new Peer(PREFIX + this.code, { debug: 0 })
        this.peer = peer
        peer.on('open', () => {
          this.set('waiting', '상대가 들어오기를 기다리는 중…')
          resolve(this.code)
        })
        peer.on('connection', (c) => {
          if (this.conn?.open) {
            c.close() // 이미 상대가 있음
            return
          }
          this.attach(c)
        })
        peer.on('error', (e) => {
          if (e.type === 'unavailable-id' && attempt < 3) {
            peer.destroy()
            tryOpen(attempt + 1)
          } else {
            this.set('error', '연결 서버에 접속하지 못했어요. 인터넷 연결을 확인해 주세요.')
            reject(e)
          }
        })
        peer.on('disconnected', () => {
          // 중계 서버와만 끊긴 것. 이미 연결된 상대와는 계속 됨
          if (!this.conn?.open) peer.reconnect()
        })
      }
      tryOpen(0)
    })
  }

  /** 방 참가 */
  join(code: string) {
    this.close()
    this.role = 'guest'
    this.code = code.trim().toUpperCase()
    this.set('connecting', '방에 연결하는 중…')
    const peer = new Peer({ debug: 0 })
    this.peer = peer
    peer.on('open', () => {
      this.attach(peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' }))
    })
    peer.on('error', (e) => {
      if (e.type === 'peer-unavailable') this.set('error', `방 ${this.code}을(를) 찾을 수 없어요. 코드를 확인하거나 방장이 방을 다시 만들어 주세요.`)
      else this.set('error', '연결하지 못했어요. 같은 와이파이에서 다시 시도해 보세요.')
    })
    // 일부 모바일 데이터 환경은 직접 연결이 막혀 있어서 시간 제한을 둠
    setTimeout(() => {
      if (this.role === 'guest' && this.status === 'connecting')
        this.set('error', '연결이 오래 걸려요. 둘 다 같은 와이파이에 연결한 뒤 다시 시도해 보세요.')
    }, 15000)
  }

  private attach(c: DataConnection) {
    this.conn = c
    c.on('open', () => this.set('connected', this.role === 'host' ? '상대가 들어왔어요!' : '방에 들어왔어요!'))
    c.on('data', (d) => this.onMessage(d))
    c.on('close', () => {
      if (this.conn === c) {
        this.conn = null
        this.set('closed', '상대와 연결이 끊겼어요.')
      }
    })
    c.on('error', () => this.set('error', '연결에 문제가 생겼어요.'))
  }

  send(msg: unknown) {
    if (this.conn?.open) this.conn.send(msg)
  }

  close() {
    this.conn?.close()
    this.peer?.destroy()
    this.conn = null
    this.peer = null
    this.role = null
    this.status = 'idle'
  }
}

export const joinLink = (code: string) => `${location.origin}${location.pathname}?join=${code}`
