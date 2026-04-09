import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface User {
  id: string;
  username: string;
  bestScore: number;
  wins: number;
  losses: number;
}

interface AuthState {
  token: string | null;
  user: User | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API = '/api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: localStorage.getItem('token'),
    user: null,
    loading: true
  });

  const setAuth = useCallback((token: string, user: User) => {
    localStorage.setItem('token', token);
    setState({ token, user, loading: false });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setState({ token: null, user: null, loading: false });
  }, []);

  useEffect(() => {
    const token = state.token;
    if (!token) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }
    fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((user: User) => setState({ token, user, loading: false }))
      .catch(() => {
        localStorage.removeItem('token');
        setState({ token: null, user: null, loading: false });
      });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || '登录失败');
    setAuth(data.token, data.user);
  }, [setAuth]);

  const register = useCallback(async (username: string, password: string) => {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || '注册失败');
    setAuth(data.token, data.user);
  }, [setAuth]);

  const value = useMemo(
    () => ({ ...state, login, register, logout }),
    [state, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
