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
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

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
      } else {
        setProfile(null);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
      setProfile(null);
    }
  };

  useEffect(() => {
    console.log("Montando AuthContext useEffect");
    let mounted = true;
    
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
    }, 8000);

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
        }
      }
    };

    initializeAuth();

    // Listen for auth changes (ignorar INITIAL_SESSION porque ya lo manejamos con getSession)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("onAuthStateChange disparado:", event, session ? "Con sesión" : "Sin sesión");
      
      if (event === 'INITIAL_SESSION') return;
      
      if (!mounted) return;

      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
      clearTimeout(fallbackTimer);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(fallbackTimer);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
