import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  AcceptInviteInput,
  AuthSessionDto,
  LoginInput,
  OrganizationDto,
  Role,
  SignupInput,
  UserDto,
} from '@flowdesk/shared';
import { api, onSessionExpired } from '../lib/api';
import { tokenStore } from '../lib/tokens';

interface AuthState {
  user: UserDto | null;
  organization: OrganizationDto | null;
  status: 'loading' | 'authenticated' | 'anonymous';
}

interface AuthContextValue extends AuthState {
  /** Access token, exposed so the realtime provider can authenticate its socket. */
  accessToken: string | null;
  login: (input: LoginInput) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  acceptInvite: (input: AcceptInviteInput) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({
    user: null,
    organization: null,
    status: 'loading',
  });
  const [accessToken, setAccessToken] = useState<string | null>(() => tokenStore.access);

  const applySession = useCallback(
    (session: AuthSessionDto) => {
      tokenStore.save(session);
      setAccessToken(session.accessToken);
      setState({ user: session.user, organization: session.organization, status: 'authenticated' });
      void queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const clearSession = useCallback(() => {
    tokenStore.clear();
    setAccessToken(null);
    setState({ user: null, organization: null, status: 'anonymous' });
    queryClient.clear();
  }, [queryClient]);

  // Restore the session on first paint (and whenever a refresh finally fails).
  useEffect(() => {
    let cancelled = false;

    if (!tokenStore.access && !tokenStore.refresh) {
      setState({ user: null, organization: null, status: 'anonymous' });
      return;
    }

    void (async () => {
      try {
        const me = await api.get<{ user: UserDto; organization: OrganizationDto }>('/auth/me');
        if (cancelled) return;
        setAccessToken(tokenStore.access);
        setState({ user: me.user, organization: me.organization, status: 'authenticated' });
      } catch {
        if (!cancelled) clearSession();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  useEffect(() => onSessionExpired(clearSession), [clearSession]);

  const login = useCallback(
    async (input: LoginInput) => {
      applySession(await api.post<AuthSessionDto>('/auth/login', input, { anonymous: true }));
    },
    [applySession],
  );

  const signup = useCallback(
    async (input: SignupInput) => {
      applySession(await api.post<AuthSessionDto>('/auth/signup', input, { anonymous: true }));
    },
    [applySession],
  );

  const acceptInvite = useCallback(
    async (input: AcceptInviteInput) => {
      applySession(
        await api.post<AuthSessionDto>('/auth/accept-invite', input, { anonymous: true }),
      );
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    const refreshToken = tokenStore.refresh;
    try {
      await api.post('/auth/logout', { refreshToken: refreshToken ?? undefined });
    } catch {
      /* logging out locally matters more than the server round-trip */
    }
    clearSession();
  }, [clearSession]);

  const hasRole = useCallback(
    (...roles: Role[]) => (state.user ? roles.includes(state.user.role) : false),
    [state.user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, accessToken, login, signup, acceptInvite, logout, hasRole }),
    [state, accessToken, login, signup, acceptInvite, logout, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
