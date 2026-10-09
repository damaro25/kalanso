import { createContext, useContext, useState, type ReactNode } from 'react';
import { apiClient } from '../api/client';
import type { Role } from '../lib/roles';
import { purgerCacheUtilisateur } from '../offline/purgerCache';

interface AuthUser {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  role: Role;
  ecoleId: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredUser(): AuthUser | null {
  const raw = localStorage.getItem('kalanso_user');
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(readStoredUser());

  async function login(email: string, password: string) {
    const { data } = await apiClient.post('/auth/login', { email, password });
    await purgerCacheUtilisateur(); // jamais les données en cache d'une autre session
    localStorage.setItem('kalanso_token', data.accessToken);
    localStorage.setItem('kalanso_user', JSON.stringify(data.user));
    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem('kalanso_token');
    localStorage.removeItem('kalanso_user');
    void purgerCacheUtilisateur();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
