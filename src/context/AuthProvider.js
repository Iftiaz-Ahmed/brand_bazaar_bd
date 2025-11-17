import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "createClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      setAuthLoading(true);
      setAuthError(null);
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;

      if (error) setAuthError(error.message);
      setSession(data?.session ?? null);
      setUser(data?.session?.user ?? null);
      setAuthLoading(false);
    }

    init();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null);
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  // helpers you can call anywhere
  const signIn = async ({ email, password }) => {
    setAuthError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
    return { data, error };
  };

  const signUp = async ({ email, password }) => {
    setAuthError(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) setAuthError(error.message);
    return { data, error };
  };

  const signOut = async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signOut(); // no args
    if (error) setAuthError(error.message);
    return { error };
  };

  const value = {
    session,
    user,
    authLoading,
    authError,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
