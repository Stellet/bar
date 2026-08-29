import type { AppState, Operation } from '../types';

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
        operations: Array.isArray(parsed.operations)
          ? parsed.operations.map((operation) => ({
              ...operation,
              openedByUserId: operation.openedByUserId ?? (operation as Operation & { userId?: string }).userId ?? parsed.currentUserId ?? '',
              currentOperatorUserId: operation.currentOperatorUserId ?? (operation as Operation & { userId?: string }).userId ?? parsed.currentUserId ?? '',
              activeProductIds: Array.isArray(operation.activeProductIds)
                ? operation.activeProductIds
                : Object.entries(operation.initialStock ?? {}).filter(([, quantity]) => Number(quantity) > 0).map(([productId]) => productId),
              partials: Array.isArray(operation.partials)
                ? operation.partials.map((partial) => ({
                    ...partial,
                    userId: partial.userId ?? operation.currentOperatorUserId ?? (operation as Operation & { userId?: string }).userId ?? parsed.currentUserId ?? '',
                  }))
                : [],
              receiptBatches: Array.isArray(operation.receiptBatches)
                ? operation.receiptBatches.map((batch, index) => ({
                    ...batch,
                    period: batch.period ?? (batch.partialId ? 'partial' : 'final'),
                    sequenceNumber: batch.sequenceNumber ?? index + 1,
                  }))
                : [],
            }))
          : [],
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
