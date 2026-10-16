import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler, type User } from '../api';

interface AuthState {
  user: User | null;
  checking: boolean;
  login: (employeeId: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
}

const Ctx = createContext<AuthState>(null as never);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api.auth.me().then(r => setUser(r.user)).catch(() => setUser(null)).finally(() => setChecking(false));
  }, []);

  const login = useCallback(async (employeeId: string, password: string) => {
    const r = await api.auth.login(employeeId, password);
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout().catch(() => {});
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, checking, login, logout, setUser }}>{children}</Ctx.Provider>;
}
