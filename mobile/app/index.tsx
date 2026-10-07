import React, { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import SplashView from '@/components/SplashView';

const MIN_SPLASH_MS = 1400; // keeps the brand animation from flashing by too fast

/** Entry point: shows the animated splash for a minimum beat, then routes
 * to the right stack depending on auth state. */
export default function Index() {
  const { user, isLoading } = useAuth();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  if (isLoading || !minTimeElapsed) {
    return <SplashView />;
  }

  return <Redirect href={user ? '/(app)/home' : '/(auth)/login'} />;
}
