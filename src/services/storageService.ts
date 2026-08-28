import type { AppState } from '../types';

const STORAGE_KEY = 'bar-operational-demo-v1';

export const defaultAppState: AppState = {
  currentUserId: null,
  activeOperationId: null,
  operations: [],
};

export const storageService = {
  loadState(): AppState {
    try {
      const rawValue = localStorage.getItem(STORAGE_KEY);
      if (!rawValue) {
        return defaultAppState;
      }

      const parsed = JSON.parse(rawValue) as AppState;
      return {
        currentUserId: parsed.currentUserId ?? null,
        activeOperationId: parsed.activeOperationId ?? null,
        operations: Array.isArray(parsed.operations) ? parsed.operations : [],
      };
    } catch {
      return defaultAppState;
    }
  },

  saveState(state: AppState): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  },

  clearState(): void {
    localStorage.removeItem(STORAGE_KEY);
  },

  getActiveOperation(state: AppState) {
    return state.operations.find((operation) => operation.id === state.activeOperationId) ?? null;
  },
};
