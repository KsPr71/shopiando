import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';

import { supabase } from '@/services/supabase';
import { getDirectoryUsers, syncCurrentUserDirectoryProfile } from '@/services/user-directory';
import { registerPushToken, unregisterPushToken } from '@/services/push-notifications';

type AuthContextValue = {
  isReady: boolean;
  session: Session | null;
  user: User | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [isReady, setIsReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) {
      setIsReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        void syncCurrentUserDirectoryProfile(data.session.user).catch(() => {});
        void getDirectoryUsers().catch(() => {});
        void registerPushToken(data.session.user.id).catch(() => {});
      }
      setIsReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        void syncCurrentUserDirectoryProfile(nextSession.user).catch(() => {});
        void getDirectoryUsers().catch(() => {});
        void registerPushToken(nextSession.user.id).catch(() => {});
      }
      setIsReady(true);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || Platform.OS === 'web') {
      return;
    }

    const authClient = supabase.auth;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        authClient.startAutoRefresh();
      } else {
        authClient.stopAutoRefresh();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isReady,
      session,
      user: session?.user ?? null,
      signOut: async () => {
        if (supabase) {
          if (session?.user) {
            await unregisterPushToken(session.user.id).catch(() => {});
          }
          await supabase.auth.signOut();
        }
      },
    }),
    [isReady, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
