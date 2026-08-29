export type MovementType = 'courtesy' | 'damage' | 'restock' | 'transfer_in' | 'transfer_out';
export type OperationStatus = 'draft' | 'open' | 'closing' | 'closed';
export type ClosingStep = 'final_count' | 'stock_review' | 'receipt_review' | 'final_summary';

export interface User {
  id: string;
  name: string;
}

export interface Venue {
  id: string;
  name: string;
}

export interface EventInfo {
  id: string;
  name: string;
}

export interface PointOfSale {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  unit: string;
  basePrice: number;
}

export interface Operation {
  id: string;
  openedByUserId: string;
  currentOperatorUserId: string;
  activeProductIds: string[];
  venueId: string;
  eventId: string;
  posId: string;
  status: OperationStatus;
  closingStep?: ClosingStep;
  openedAt: string;
  closedAt?: string;
  initialStock: Record<string, number>;
  movements: Movement[];
  partials: PartialCount[];
  receiptBatches: ReceiptBatch[];
  closingCountDraft?: Record<string, number>;
  closingFinancial?: FinancialSnapshot;
  finalCount?: FinalCount;
}

export interface Movement {
  id: string;
  operationId: string;
  productId: string;
  type: MovementType;
  quantity: number;
  timestamp: string;
  userId: string;
}

export interface PartialCount {
  id: string;
  operationId: string;
  countedStock: Record<string, number>;
  receiptBatchIds: string[];
  createdAt: string;
  userId: string;
  financial?: FinancialSnapshot;
  status: 'confirmed';
}

export interface FinancialSnapshot {
  machineTotal?: number;
  cashCounted?: number;
}

export interface ReceiptBatch {
  id: string;
  operationId: string;
  partialId?: string;
  period: 'partial' | 'final';
  sequenceNumber: number;
  source: string;
  receiptCount: number;
  totalValue?: number;
  notes?: string;
  timestamp: string;
  confirmed: boolean;
}

export interface FinalCount {
  id: string;
  operationId: string;
  countedStock: Record<string, number>;
  timestamp: string;
}

export interface AppState {
  currentUserId: string | null;
  activeOperationId: string | null;
  operations: Operation[];
}
