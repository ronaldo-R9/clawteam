import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';

export function useSocket(): Socket | null {
  const { token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
      }
      return;
    }

    const s = io({
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socketRef.current = s;
    setSocket(s);

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  return socket;
}
