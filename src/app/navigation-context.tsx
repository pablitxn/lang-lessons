import { createContext, useContext } from 'react';

/** Return only the destination acknowledged by the mounted lifecycle's navigate port. */
export type RootExitHandler = (destination: string) => Promise<string | null>;
/** P4 owns its coordinator; App alone owns history. Cleanup cannot unregister a newer session. */
export type RegisterRootExit = (handler: RootExitHandler) => () => void;
export const RootExitRegistration = createContext<RegisterRootExit | null>(null);
export function useRootExitRegistration() { return useContext(RootExitRegistration); }
