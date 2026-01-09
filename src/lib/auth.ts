import { supabase } from "@/integrations/supabase/client";

export type UserRole = 'admin' | 'seller' | 'investor';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  fullName?: string;
  companyName?: string;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
}

export async function signUp(email: string, password: string, fullName?: string) {
  const redirectUrl = `${window.location.origin}/`;
  
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectUrl,
      data: {
        full_name: fullName,
      },
    },
  });
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getUserRole(userId: string): Promise<UserRole> {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle(); // Use maybeSingle() instead of single() to avoid errors when no record exists
    
    if (error || !data) {
      // Investor is the default role if no role is assigned
      return 'investor';
    }
    
    return data.role as UserRole;
  } catch (error) {
    console.error('Error fetching user role:', error);
    return 'investor'; // Default to investor on any error
  }
}

export async function getUserProfile(userId: string) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle(); // Use maybeSingle() instead of single()
    
    // If profile doesn't exist, create it
    if (error && error.code === 'PGRST116' || (!data && !error)) {
      // Profile doesn't exist, try to create it
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            email: userData.user.email || '',
            full_name: userData.user.user_metadata?.full_name || null,
          })
          .select()
          .single();
        
        if (createError) {
          console.error('Error creating profile:', createError);
          return { data: null, error: createError };
        }
        
        return { data: newProfile, error: null };
      }
    }
    
    return { data, error };
  } catch (error: any) {
    console.error('Error fetching user profile:', error);
    return { data: null, error };
  }
}

export async function isAdmin(userId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  return role === 'admin';
}
