import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { getUserRole, getUserProfile, type UserRole } from '@/lib/auth';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  profile: {
    fullName?: string;
    companyName?: string;
    email?: string;
  } | null;
  loading: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  profile: null,
  loading: true,
  isAdmin: false,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [profile, setProfile] = useState<AuthContextType['profile']>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer fetching additional data to avoid deadlocks
        if (session?.user) {
          setTimeout(() => {
            fetchUserData(session.user.id);
          }, 0);
        } else {
          setRole(null);
          setProfile(null);
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserData = async (userId: string) => {
    try {
      const [userRole, userProfile] = await Promise.all([
        getUserRole(userId),
        getUserProfile(userId),
      ]);
      
      setRole(userRole);
      
      if (userProfile.data) {
        setProfile({
          fullName: userProfile.data.full_name || undefined,
          companyName: userProfile.data.company_name || undefined,
          email: userProfile.data.email || undefined,
        });
      } else if (userProfile.error) {
        console.error('Error fetching profile:', userProfile.error);
        // Set minimal profile from auth user if profile fetch fails
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setProfile({
            email: user.email || undefined,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      // Ensure loading is set to false even on error
      setRole('investor'); // Default to investor role
    } finally {
      setLoading(false);
    }
  };

  const value = {
    user,
    session,
    role,
    profile,
    loading,
    isAdmin: role === 'admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
