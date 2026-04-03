// lib/userContext.ts
// Global context für Tab-Bar Streak + Dashboard-Sheet Trigger
import { createContext, useContext } from 'react';

export interface UserContextType {
  streak: number;
  setStreak: (n: number) => void;
  openDashboard: () => void;
  registerOpenDashboard: (fn: () => void) => void;
}

export const UserContext = createContext<UserContextType>({
  streak: 0,
  setStreak: () => {},
  openDashboard: () => {},
  registerOpenDashboard: () => {},
});

export const useUserCtx = () => useContext(UserContext);
