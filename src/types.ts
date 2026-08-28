export type MovementType = 'courtesy' | 'damage' | 'restock' | 'transfer_in' | 'transfer_out';
export type OperationStatus = 'draft' | 'open' | 'closing' | 'closed';

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
}

export interface Operation {
  id: string;
  userId: string;
  venueId: string;
  eventId: string;
  posId: string;
  status: OperationStatus;
  openedAt: string;
  closedAt?: string;
  initialStock: Record<string, number>;
  movements: Movement[];
  partials: PartialCount[];
  receiptBatches: ReceiptBatch[];
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
  status: 'confirmed';
}

export interface ReceiptBatch {
  id: string;
  operationId: string;
  partialId?: string;
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
