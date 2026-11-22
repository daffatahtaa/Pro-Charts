import { LiveTick, Timeframe, TradeStatePayload } from '../types/chart';

const WS_URL = 'ws://localhost:8000/ws/stream';

type TickListener = (tick: LiveTick) => void;
type TradeStateListener = (state: TradeStatePayload) => void;
type StatusListener = (connected: boolean) => void;

class MarketWebSocket {
  private ws: WebSocket | null = null;
  private symbol = 'XAUUSD';
  private tf: Timeframe = '15m';
  private reconnectTimer: number | null = null;
  private manualClose = false;
  private tickListeners = new Set<TickListener>();
  private tradeStateListeners = new Set<TradeStateListener>();
  private statusListeners = new Set<StatusListener>();

  connect(symbol: string, tf: Timeframe) {
    this.symbol = symbol;
    this.tf = tf;
    this.manualClose = false;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscribe();
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.openSocket();
  }

  subscribe(symbol: string, tf: Timeframe) {
    this.symbol = symbol;
    this.tf = tf;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscribe();
    } else {
      this.connect(symbol, tf);
    }
  }

  private openSocket() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      this.ws = new WebSocket(WS_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.emitStatus(true);
      this.sendSubscribe();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data?.type === 'realtime_update') {
          this.tickListeners.forEach((cb) => cb(data as LiveTick));
        } else if (data?.type === 'trade_state_update') {
          this.tradeStateListeners.forEach((cb) =>
            cb({
              account: data.account,
              positions: data.positions || [],
              orders: data.orders || [],
            })
          );
        }
      } catch {
        // Ignore malformed packets
      }
    };

    this.ws.onclose = () => {
      this.emitStatus(false);
      this.ws = null;
      if (!this.manualClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private sendSubscribe() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          action: 'subscribe',
          symbol: this.symbol,
          tf: this.tf,
        })
      );
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manualClose) {
        this.openSocket();
      }
    }, 2000);
  }

  private emitStatus(connected: boolean) {
    this.statusListeners.forEach((cb) => cb(connected));
  }

  onTick(listener: TickListener): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  onTradeState(listener: TradeStateListener): () => void {
    this.tradeStateListeners.add(listener);
    return () => this.tradeStateListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  disconnect() {
    this.manualClose = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const marketWs = new MarketWebSocket();
