import { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  area_id?: string;
  photo_url?: string;
  modules?: string[];
  can_edit_facturas?: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  impersonatedRole: string | null;
  canImpersonate: boolean;
  impersonateRole: (role: string | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  session: null,
  loading: true,
  signOut: async () => {},
  impersonatedRole: null,
  canImpersonate: false,
  impersonateRole: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [impersonatedRole, setImpersonatedRole] = useState<string | null>(null);
  const [dbRole, setDbRole] = useState<string | null>(null);

  const fetchProfile = async (userId: string) => {
    console.log("Iniciando fetchProfile para:", userId);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      console.log("Respuesta de fetchProfile:", { data, error });
      if (!error && data) {
        setProfile(data as UserProfile);
        setDbRole(data.role);
      } else {
        setProfile(null);
        setDbRole(null);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
      setProfile(null);
      setDbRole(null);
    }
  };

  useEffect(() => {
    console.log("Montando AuthContext useEffect");
    let mounted = true;
    let authSubscription: { unsubscribe: () => void } | null = null;
    
    // Fallback de seguridad: Si Supabase se cuelga (típicamente deadlock del refresh token),
    // limpiamos el local storage automáticamente para evitar que el usuario tenga que "borrar sus datos" manualmente.
    const fallbackTimer = setTimeout(() => {
      console.log("¡TIMEOUT ACTIVADO! Sesión corrupta detectada. Limpiando datos...");
      
      // Limpiar tokens de supabase corruptos en localStorage
      try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      } catch (e) {
        console.error("Error limpiando localStorage", e);
      }
      
      if (mounted) {
        setUser(null);
        setSession(null);
        setProfile(null);
        setLoading(false);
      }
      
      // Forzar recarga limpia hacia el login
      window.location.href = '/login';
    }, 50000); // 50s para tolerar cold-starts prolongados

    const initializeAuth = async () => {
      try {
        console.log("Llamando getSession...");
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) throw error;
        
        console.log("getSession completado:", session ? "Con sesión" : "Sin sesión");
        
        if (!mounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
        }
      } catch (err) {
        console.error("Error getting session:", err);
        if (mounted) {
          setProfile(null);
          setUser(null);
          setSession(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
          clearTimeout(fallbackTimer);

          // Escuchar cambios de auth sólo tras inicializar la sesión inicial.
          //
          // IMPORTANTE: este callback NO debe hacer `await` de llamadas a Supabase
          // (getSession, .from(), etc.). El callback corre con el lock de auth
          // tomado; una query que espera el token se queda esperando ESE MISMO lock
          // → DEADLOCK: la app queda navegable pero NINGUNA query de Supabase
          // resuelve hasta recargar (cmd+R). Por eso el callback es síncrono y el
          // fetchProfile se difiere FUERA del lock con setTimeout(…, 0).
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
            console.log("onAuthStateChange disparado:", event, newSession ? "Con sesión" : "Sin sesión");

            if (event === 'PASSWORD_RECOVERY') {
              console.log("Redireccionando a /reset-password por PASSWORD_RECOVERY");
              if (mounted) {
                setSession(newSession);
                setUser(newSession?.user ?? null);
                setLoading(false);
              }
              if (window.location.pathname !== '/reset-password') {
                window.location.href = '/reset-password';
              }
              return;
            }

            if (event === 'INITIAL_SESSION') return;

            if (!mounted) return;

            setSession(newSession);
            setUser(newSession?.user ?? null);
            setLoading(false);

            // Trabajo de DB FUERA del callback (evita el deadlock del lock de auth).
            if (newSession?.user) {
              const uid = newSession.user.id;
              setTimeout(() => { if (mounted) fetchProfile(uid); }, 0);
            } else {
              setProfile(null);
            }
          });

          authSubscription = subscription;
        }
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
      clearTimeout(fallbackTimer);
    };
  }, []);

  const signOut = async () => {
    setImpersonatedRole(null);
    setDbRole(null);
    await supabase.auth.signOut();
  };

  const activeProfile = profile ? {
    ...profile,
    role: impersonatedRole || profile.role
  } : null;

  const canImpersonate = dbRole === 'admin';
  const impersonateRole = (role: string | null) => setImpersonatedRole(role);

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile: activeProfile, 
      session, 
      loading, 
      signOut, 
      impersonatedRole, 
      canImpersonate, 
      impersonateRole 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
