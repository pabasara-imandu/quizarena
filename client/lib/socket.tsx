'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { defaultServer } from '@/lib/servers';


type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface SocketContextValue {
  socket: Socket | null;
  status: ConnectionState;
  /** Latest measured round-trip time, in ms. */
  rtt: number;
  /** serverTime - clientTime, in ms. Added to Date.now() for a shared clock. */
  clockOffset: number;
  /** Current time in *server* milliseconds. Every countdown is derived from this. */
  serverNow: () => number;
  /** Promise wrapper around an ack-style emit, with a timeout so the UI never hangs. */
  emit: <T = any>(event: string, payload?: unknown, timeoutMs?: number) => Promise<T>;
  /** Which server of the fleet this socket is attached to. */
  serverUrl: string;
  /**
   * Point the socket at a different server and wait until it is live there.
   *
   * A room lives on exactly one instance, so hosting or joining means moving to
   * that instance first. Resolves once connected, so callers can emit straight
   * after awaiting it; a no-op when already on that server.
   */
  connectTo: (url: string) => Promise<void>;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionState>('connecting');
  const [rtt, setRtt] = useState(0);
  // Starts on the first server so the app is live immediately; hosting and
  // joining re-point it once the right instance is known.
  const [target, setTarget] = useState<string>(() => defaultServer());

  // Kept in a ref as well as state: countdowns read it every animation frame
  // and must not re-subscribe just because the offset drifted by 2ms.
  const offsetRef = useRef(0);
  const [clockOffset, setClockOffset] = useState(0);
  const bestSampleRef = useRef({ rtt: Number.POSITIVE_INFINITY, offset: 0 });

  // Set by connectTo when it has already built and adopted a socket for this
  // target, so the effect below does not immediately replace it with a second
  // connection to the same place.
  const targetAdoptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (targetAdoptedRef.current === target) {
      targetAdoptedRef.current = null;
      return;
    }

    const s = io(target, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
      reconnectionAttempts: Infinity,
      timeout: 10000,
    });

    socketRef.current = s;
    setSocket(s);

    s.on('connect', () => setStatus('connected'));
    s.on('disconnect', () => setStatus('reconnecting'));
    s.io.on('reconnect_attempt', () => setStatus('reconnecting'));
    s.io.on('error', () => setStatus('disconnected'));

    return () => {
      s.removeAllListeners();
      s.close();
      socketRef.current = null;
    };
  }, [target]);

  /**
   * NTP-style clock sync.
   *
   * A quiz is only fair if every phone agrees on when the timer hits zero. We
   * sample a few round trips, keep the one with the lowest RTT (least likely to
   * be skewed by a slow hop), and store `offset = serverTime - clientMidpoint`.
   * From then on every countdown is computed against server time, so changing
   * the device clock does nothing.
   */
  const sample = useCallback(() => {
    const s = socketRef.current;
    if (!s?.connected) return;
    const sentAt = Date.now();
    s.timeout(4000).emit('sync:time', sentAt, (err: unknown, res: { serverTime: number }) => {
      if (err || !res) return;
      const receivedAt = Date.now();
      const roundTrip = receivedAt - sentAt;
      const offset = res.serverTime - (sentAt + roundTrip / 2);

      setRtt(roundTrip);
      if (roundTrip < bestSampleRef.current.rtt) {
        bestSampleRef.current = { rtt: roundTrip, offset };
        offsetRef.current = offset;
        setClockOffset(offset);
      }
    });
  }, []);

  useEffect(() => {
    if (status !== 'connected') return;
    // Burst on connect to converge fast, then drift-correct once a minute.
    bestSampleRef.current = { rtt: Number.POSITIVE_INFINITY, offset: offsetRef.current };
    const bursts = [0, 300, 700, 1400].map((d) => setTimeout(sample, d));
    const interval = setInterval(sample, 60_000);
    return () => {
      bursts.forEach(clearTimeout);
      clearInterval(interval);
    };
  }, [status, sample]);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  const connectTo = useCallback(
    (url: string) =>
      new Promise<void>((resolve, reject) => {
        const clean = url.replace(/\/+$/, '');
        if (clean === target && socketRef.current?.connected) return resolve();

        // A free instance may be asleep, and its first handshake can take the
        // best part of a minute. Wait generously rather than failing a teacher
        // who did nothing wrong.
        const s = io(clean, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionDelay: 500,
          reconnectionDelayMax: 4000,
          reconnectionAttempts: Infinity,
          timeout: 20000,
        });

        const giveUp = setTimeout(() => {
          s.close();
          reject(new Error('That quiz server did not answer. It may be waking up - try again.'));
        }, 45000);

        s.once('connect', () => {
          clearTimeout(giveUp);
          // Swap the live socket over, then let the effect adopt `clean` as the
          // target so reconnects go to the right place too.
          socketRef.current?.removeAllListeners();
          socketRef.current?.close();

          socketRef.current = s;
          setSocket(s);
          setStatus('connected');
          s.on('connect', () => setStatus('connected'));
          s.on('disconnect', () => setStatus('reconnecting'));
          s.io.on('reconnect_attempt', () => setStatus('reconnecting'));
          s.io.on('error', () => setStatus('disconnected'));

          targetAdoptedRef.current = clean;
          setTarget(clean);
          resolve();
        });
      }),
    [target]
  );

  const emit = useCallback(<T,>(event: string, payload?: unknown, timeoutMs = 8000): Promise<T> => {
    return new Promise((resolve, reject) => {
      const s = socketRef.current;
      if (!s) return reject(new Error('Socket is not ready yet.'));
      s.timeout(timeoutMs).emit(event, payload ?? {}, (err: unknown, res: T) => {
        if (err) reject(new Error('The server did not respond. Check your connection.'));
        else resolve(res);
      });
    });
  }, []);

  const value = useMemo(
    () => ({ socket, status, rtt, clockOffset, serverNow, emit, serverUrl: target, connectTo }),
    [socket, status, rtt, clockOffset, serverNow, emit, target, connectTo]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used inside <SocketProvider>.');
  return ctx;
}

/**
 * Subscribe to a server event without re-binding on every render. The handler
 * is kept in a ref so callers can pass an inline arrow function safely - which
 * matters here, because re-binding mid-question would drop frames.
 */
export function useSocketEvent<T = any>(event: string, handler: (payload: T) => void) {
  const { socket } = useSocket();
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!socket) return;
    const listener = (payload: T) => ref.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}
