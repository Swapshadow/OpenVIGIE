'use client';
import { createContext, useContext } from 'react';
export type Desk = 'fil' | 'certfr' | 'hebdo' | 'recherche';
export const WorkspaceNavigation = createContext<Desk>('fil');
export const useWorkspaceDesk = () => useContext(WorkspaceNavigation);
