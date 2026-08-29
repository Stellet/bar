import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react';
import { createEmptyStock, mockEvent, mockPointOfSale, mockProducts, mockUsers, mockVenue, movementTypeLabels, receiptSources } from './data/mock';
import { storageService } from './services/storageService';
import type { AppState, ClosingStep, Movement, MovementType, Operation, PartialCount, ReceiptBatch } from './types';
import './styles.css';

type Screen =
  | 'login'
  | 'open-operation'
  | 'operator-selection'
  | 'home'
  | 'movement'
  | 'transfer'
  | 'partial-count'
  | 'partial-batches'
  | 'partial-summary'
  | 'closing-count'
  | 'closing-summary'
  | 'closing-receipts'
  | 'final-summary'
  | 'success'
  | 'history';

type ToastState = {
  message: string;
  undo?: () => void;
  actionLabel?: string;
};

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);

const parseOptionalCurrency = (value: string) => {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getMovementLabel = (type: MovementType): string => movementTypeLabels[type] ?? type;

const getExpectedStock = (operation: Operation, productId: string) => {
  const initialValue = Number(operation.initialStock[productId] ?? 0);
  return operation.movements.reduce((total, movement) => {
    if (movement.productId !== productId) {
      return total;
    }

    switch (movement.type) {
      case 'courtesy':
      case 'damage':
      case 'transfer_out':
        return total - movement.quantity;
      case 'restock':
      case 'transfer_in':
        return total + movement.quantity;
      default:
        return total;
    }
  }, initialValue);
};

const getTotalReceiptCount = (operation: Operation) =>
  operation.receiptBatches.reduce((total, batch) => total + batch.receiptCount, 0);

const getClosingScreen = (step: ClosingStep | undefined): Screen => {
  switch (step) {
    case 'stock_review':
      return 'closing-summary';
    case 'receipt_review':
      return 'closing-receipts';
    case 'final_summary':
      return 'final-summary';
    case 'final_count':
    default:
      return 'closing-count';
  }
};

type HomeOverlay = 'operator' | 'movements' | 'partials' | null;

const formatOperationDuration = (operation: Operation, endTime = Date.now()) => {
  const duration = Math.max(0, (operation.closedAt ? new Date(operation.closedAt).getTime() : endTime) - new Date(operation.openedAt).getTime());
  const hours = Math.floor(duration / 3600000);
  const minutes = Math.floor((duration % 3600000) / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);

  return hours === 0 && minutes === 0 ? `${seconds}s` : `${hours}h ${minutes}m`;
};

const getOperationSummary = (operation: Operation) => {
  const courtesy = operation.movements.filter((movement) => movement.type === 'courtesy').reduce((sum, movement) => sum + movement.quantity, 0);
  const damage = operation.movements.filter((movement) => movement.type === 'damage').reduce((sum, movement) => sum + movement.quantity, 0);
  const restock = operation.movements.filter((movement) => movement.type === 'restock').reduce((sum, movement) => sum + movement.quantity, 0);
  const transferIn = operation.movements.filter((movement) => movement.type === 'transfer_in').reduce((sum, movement) => sum + movement.quantity, 0);
  const transferOut = operation.movements.filter((movement) => movement.type === 'transfer_out').reduce((sum, movement) => sum + movement.quantity, 0);

  return {
    courtesy,
    damage,
    restock,
    transferIn,
    transferOut,
  };
};

const getProductMovementTotal = (operation: Operation, productId: string, type: MovementType) =>
  operation.movements
    .filter((movement) => movement.productId === productId && movement.type === type)
    .reduce((total, movement) => total + movement.quantity, 0);

const getProductFinalMetrics = (operation: Operation, productId: string) => {
  const initial = Number(operation.initialStock[productId] ?? 0);
  const final = Number(operation.finalCount?.countedStock[productId] ?? 0);
  const restock = getProductMovementTotal(operation, productId, 'restock');
  const transferIn = getProductMovementTotal(operation, productId, 'transfer_in');
  const transferOut = getProductMovementTotal(operation, productId, 'transfer_out');
  const courtesy = getProductMovementTotal(operation, productId, 'courtesy');
  const damage = getProductMovementTotal(operation, productId, 'damage');
  const physicalOutput = Math.max(0, initial + restock + transferIn - transferOut - final);
  const presumedSales = Math.max(0, physicalOutput - courtesy - damage);

  return { initial, final, physicalOutput, presumedSales };
};

const getPartialStockMetrics = (operation: Operation, productId: string, currentCount: number) => {
  const lastPartial = operation.partials.at(-1);
  const previousStock = Number(lastPartial?.countedStock[productId] ?? operation.initialStock[productId] ?? 0);
  const periodStart = lastPartial ? new Date(lastPartial.createdAt).getTime() : new Date(operation.openedAt).getTime();
  const periodMovements = operation.movements.filter((movement) => movement.productId === productId && new Date(movement.timestamp).getTime() > periodStart);
  const restock = periodMovements.filter((movement) => movement.type === 'restock').reduce((total, movement) => total + movement.quantity, 0);
  const transferIn = periodMovements.filter((movement) => movement.type === 'transfer_in').reduce((total, movement) => total + movement.quantity, 0);
  const transferOut = periodMovements.filter((movement) => movement.type === 'transfer_out').reduce((total, movement) => total + movement.quantity, 0);
  const periodOutput = Math.max(0, previousStock + restock + transferIn - transferOut - currentCount);
  return { previousStock, periodOutput };
};

function ProductCountEditor({
  products,
  values,
  onChange,
}: {
  products: typeof mockProducts;
  values: Record<string, number>;
  onChange: (productId: string, value: number) => void;
}) {
  return (
    <div className="count-list">
      {products.map((product) => (
        <div key={product.id} className="count-card">
          <div className="product-meta">
            <strong>{product.name}</strong>
            <span>{product.unit}</span>
          </div>
          <div className="quantity-control">
            <button type="button" aria-label={`Diminuir ${product.name}`} onClick={() => onChange(product.id, (values[product.id] ?? 0) - 1)}>
              −
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={values[product.id] ?? 0}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => onChange(product.id, Number(event.target.value || 0))}
              aria-label={`Quantidade de ${product.name}`}
            />
            <button type="button" aria-label={`Aumentar ${product.name}`} onClick={() => onChange(product.id, (values[product.id] ?? 0) + 1)}>
              +
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="back-button" onClick={onClick} aria-label="Voltar">← Voltar</button>;
}

function OperationContext({ operation }: { operation: Operation }) {
  return (
    <div className="operation-context">
      <strong>{mockEvent.name}</strong>
      <span>Operador: {mockUsers.find((user) => user.id === operation.currentOperatorUserId)?.name ?? 'Usuário'}</span>
    </div>
  );
}

function TemporaryConfirmation({
  toast,
  onClose,
}: {
  toast: ToastState | null;
  onClose: () => void;
}) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const start = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const next = Math.max(0, 100 - (elapsed / 3500) * 100);
      setProgress(next);
      if (next === 0) {
        window.clearInterval(interval);
        onClose();
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [toast, onClose]);

  if (!toast) {
    return null;
  }

  return (
    <div className="toast" role="status" aria-live="polite">
      <div className="toast-header">
        <span>✓</span>
        <strong>{toast.message}</strong>
      </div>
      <div className="toast-actions">
        {toast.undo ? <button type="button" onClick={toast.undo}>Desfazer</button> : null}
        <button type="button" className="ghost" onClick={onClose}>Fechar</button>
      </div>
      <div className="toast-progress">
        <span style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function App() {
  const [appState, setAppState] = useState<AppState>(() => storageService.loadState());
  const [screen, setScreen] = useState<Screen>('login');
  const [selectedUserId, setSelectedUserId] = useState<string>(appState.currentUserId ?? mockUsers[0].id);
  const [openingStock, setOpeningStock] = useState<Record<string, number>>(createEmptyStock());
  const [movementDraft, setMovementDraft] = useState<Record<string, number>>(createEmptyStock());
  const [transferDraft, setTransferDraft] = useState<Record<string, number>>(createEmptyStock());
  const [movementType, setMovementType] = useState<MovementType>('courtesy');
  const [transferType, setTransferType] = useState<MovementType>('transfer_in');
  const [partialCountDraft, setPartialCountDraft] = useState<Record<string, number>>(createEmptyStock());
  const [receiptDraft, setReceiptDraft] = useState({ source: receiptSources[0], receiptCount: 0, totalValue: '', notes: '' });
  const [partialBatches, setPartialBatches] = useState<ReceiptBatch[]>([]);
  const [partialFinancialDraft, setPartialFinancialDraft] = useState({ machineTotal: '', cashCounted: '' });
  const [finalCountDraft, setFinalCountDraft] = useState<Record<string, number>>(createEmptyStock());
  const [closingBatchDraft, setClosingBatchDraft] = useState({ source: receiptSources[0], receiptCount: 0, totalValue: '', notes: '' });
  const [closingConfirmedIds, setClosingConfirmedIds] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<ToastState | null>(null);
  const [homeOverlay, setHomeOverlay] = useState<HomeOverlay>(null);
  const [pendingOperatorId, setPendingOperatorId] = useState<string | null>(null);

  const activeOperation = useMemo(
    () => storageService.getActiveOperation(appState) ?? null,
    [appState],
  );

  const activeProducts = useMemo(
    () => activeOperation ? mockProducts.filter((product) => activeOperation.activeProductIds.includes(product.id)) : mockProducts,
    [activeOperation],
  );

  useEffect(() => {
    storageService.saveState(appState);
  }, [appState]);

  useEffect(() => {
    if (appState.currentUserId && !appState.activeOperationId && screen === 'login') {
      setScreen('open-operation');
    }
  }, [appState.currentUserId, appState.activeOperationId, screen]);

  useEffect(() => {
    if (activeOperation) {
      setScreen((currentScreen) => {
        if (currentScreen === 'login' || currentScreen === 'open-operation') {
          return activeOperation.status === 'closing' ? getClosingScreen(activeOperation.closingStep) : 'home';
        }
        return currentScreen;
      });
    }
  }, [activeOperation]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const setProductValue = (setter: Dispatch<SetStateAction<Record<string, number>>>, productId: string, value: number) => {
    setter((current) => ({ ...current, [productId]: Math.max(0, Number(value) || 0) }));
  };

  const setFinalCountValue = (productId: string, value: number) => {
    if (!activeOperation) return;

    const normalizedValue = Math.max(0, Number(value) || 0);
    setFinalCountDraft((current) => ({ ...current, [productId]: normalizedValue }));
    setAppState((current) => ({
      ...current,
      operations: current.operations.map((operation) =>
        operation.id === activeOperation.id
          ? {
              ...operation,
              closingCountDraft: {
                ...(operation.closingCountDraft ?? createEmptyStock()),
                [productId]: normalizedValue,
              },
            }
          : operation,
      ),
    }));
  };

  const currentMovementDraft = screen === 'transfer' ? transferDraft : movementDraft;
  const selectedProducts = activeProducts.filter((product) => (currentMovementDraft[product.id] ?? 0) > 0);
  const movementTotal = selectedProducts.reduce((sum, product) => sum + (currentMovementDraft[product.id] ?? 0), 0);

  const handleLogin = () => {
    setAppState((current) => ({ ...current, currentUserId: selectedUserId }));
    setScreen(activeOperation ? 'home' : 'open-operation');
  };

  const handleOpenOperation = () => {
    if (!appState.currentUserId) {
      return;
    }

    const operation: Operation = {
      id: createId('operation'),
      openedByUserId: appState.currentUserId,
      currentOperatorUserId: appState.currentUserId,
      activeProductIds: mockProducts.filter((product) => Number(openingStock[product.id] ?? 0) > 0).map((product) => product.id),
      venueId: mockVenue.id,
      eventId: mockEvent.id,
      posId: mockPointOfSale.id,
      status: 'open',
      openedAt: new Date().toISOString(),
      initialStock: { ...openingStock },
      movements: [],
      partials: [],
      receiptBatches: [],
    };

    setAppState((current) => ({
      ...current,
      activeOperationId: operation.id,
      operations: [...current.operations, operation],
    }));
    setScreen('operator-selection');
  };

  const applyMovement = () => {
    if (!activeOperation || selectedProducts.length === 0) {
      return;
    }

    const appliedMovementType = screen === 'transfer' ? transferType : movementType;
    const createdMovements: Movement[] = selectedProducts.flatMap((product) => {
      const quantity = currentMovementDraft[product.id] ?? 0;
      if (quantity <= 0) {
        return [];
      }

      return [
        {
          id: createId('movement'),
          operationId: activeOperation.id,
          productId: product.id,
          type: appliedMovementType,
          quantity,
          timestamp: new Date().toISOString(),
          userId: activeOperation.currentOperatorUserId,
        },
      ];
    });

    const message =
      createdMovements.length === 1
        ? `✓ ${mockProducts.find((product) => product.id === createdMovements[0].productId)?.name} registrado como ${getMovementLabel(appliedMovementType)}`
        : `✓ ${createdMovements.length} itens registrados como ${getMovementLabel(appliedMovementType)}`;

    setAppState((current) => ({
      ...current,
      operations: current.operations.map((operation) =>
        operation.id !== activeOperation.id
          ? operation
          : {
              ...operation,
              movements: [...operation.movements, ...createdMovements],
            },
      ),
    }));

    if (screen === 'transfer') setTransferDraft(createEmptyStock());
    else setMovementDraft(createEmptyStock());
    setToast({
      message,
      undo: () => {
        setAppState((current) => ({
          ...current,
          operations: current.operations.map((operation) =>
            operation.id !== activeOperation.id
              ? operation
              : {
                  ...operation,
                  movements: operation.movements.filter((movement) => !createdMovements.some((created) => created.id === movement.id)),
                },
          ),
        }));
        setToast(null);
      },
    });
    setScreen('home');
  };

  const addReceiptBatch = (mode: 'partial' | 'closing') => {
    const draft = mode === 'partial' ? receiptDraft : closingBatchDraft;
    const count = Number(draft.receiptCount || 0);

    if (count <= 0) {
      return;
    }

    const formattedBatch: ReceiptBatch = {
      id: createId('batch'),
      operationId: activeOperation!.id,
      partialId: undefined,
      period: mode === 'partial' ? 'partial' : 'final',
      sequenceNumber: activeOperation!.receiptBatches.length + partialBatches.length + 1,
      source: draft.source,
      receiptCount: count,
      totalValue: parseOptionalCurrency(draft.totalValue),
      notes: draft.notes || undefined,
      timestamp: new Date().toISOString(),
      confirmed: false,
    };

    if (mode === 'partial') {
      setPartialBatches((current) => [...current, formattedBatch]);
      setReceiptDraft({ source: receiptSources[0], receiptCount: 0, totalValue: '', notes: '' });
    } else {
      setAppState((current) => ({
        ...current,
        operations: current.operations.map((operation) =>
          operation.id !== activeOperation!.id
            ? operation
            : {
                ...operation,
                receiptBatches: [...operation.receiptBatches, formattedBatch],
              },
        ),
      }));
      setClosingBatchDraft({ source: receiptSources[0], receiptCount: 0, totalValue: '', notes: '' });
    }
  };

  const confirmPartial = () => {
    if (!activeOperation) {
      return;
    }

    const partial: PartialCount = {
      id: createId('partial'),
      operationId: activeOperation.id,
      countedStock: { ...partialCountDraft },
      receiptBatchIds: partialBatches.map((batch) => batch.id),
      createdAt: new Date().toISOString(),
      userId: activeOperation.currentOperatorUserId,
      financial: {
        machineTotal: parseOptionalCurrency(partialFinancialDraft.machineTotal),
        cashCounted: parseOptionalCurrency(partialFinancialDraft.cashCounted),
      },
      status: 'confirmed',
    };

    setAppState((current) => ({
      ...current,
      operations: current.operations.map((operation) =>
        operation.id !== activeOperation.id
          ? operation
          : {
              ...operation,
              partials: [...operation.partials, partial],
              receiptBatches: [...operation.receiptBatches, ...partialBatches.map((batch) => ({ ...batch, period: 'partial' as const, partialId: partial.id, operationId: activeOperation.id }))],
            },
      ),
    }));

    setToast({
      message: `✓ Parcial registrada às ${formatTime(new Date().toISOString())}`,
    });
    setPartialBatches([]);
    setPartialFinancialDraft({ machineTotal: '', cashCounted: '' });
    setScreen('home');
  };

  const finaliseClosure = () => {
    if (!activeOperation) {
      return;
    }

    const finalCount = {
      id: createId('final-count'),
      operationId: activeOperation.id,
      countedStock: { ...(activeOperation.closingCountDraft ?? finalCountDraft) },
      timestamp: new Date().toISOString(),
    };

    setAppState((current) => ({
      ...current,
      operations: current.operations.map((operation) =>
        operation.id !== activeOperation.id
          ? operation
          : {
              ...operation,
              status: 'closing',
              closingStep: 'stock_review',
              closingCountDraft: undefined,
              finalCount,
            },
      ),
    }));
    setScreen('closing-summary');
  };

  const finalizeOperation = () => {
    if (!activeOperation || activeOperation.receiptBatches.some((batch) => !batch.confirmed)) {
      return;
    }

    const closedAt = new Date().toISOString();

    setAppState((current) => ({
      ...current,
      operations: current.operations.map((operation) =>
        operation.id !== activeOperation.id
          ? operation
          : {
              ...operation,
              status: 'closed',
              closingStep: undefined,
              closedAt,
            },
      ),
    }));
    setScreen('success');
  };

  const resetDemo = () => {
    const shouldReset = window.confirm('Resetar toda a demonstração?');
    if (!shouldReset) {
      return;
    }

    storageService.clearState();
    setAppState({ currentUserId: null, activeOperationId: null, operations: [] });
    setScreen('login');
    setSelectedUserId(mockUsers[0].id);
    setOpeningStock(createEmptyStock());
    setMovementDraft(createEmptyStock());
    setTransferDraft(createEmptyStock());
    setPartialCountDraft(createEmptyStock());
    setFinalCountDraft(createEmptyStock());
    setPartialBatches([]);
    setPartialFinancialDraft({ machineTotal: '', cashCounted: '' });
    setClosingBatchDraft({ source: receiptSources[0], receiptCount: 0, totalValue: '', notes: '' });
    setToast(null);
  };

  const setClosingStep = (closingStep: ClosingStep, nextScreen: Screen) => {
    if (!activeOperation) {
      return;
    }

    setAppState((current) => ({
      ...current,
      operations: current.operations.map((operation) =>
        operation.id === activeOperation.id ? { ...operation, status: 'closing', closingStep } : operation,
      ),
    }));
    setScreen(nextScreen);
  };

  const setBatchConfirmed = (batchId: string, confirmed: boolean) => {
    if (!activeOperation) {
      return;
    }

    setClosingConfirmedIds((current) => ({ ...current, [batchId]: confirmed }));
    setAppState((current) => ({
      ...current,
      operations: current.operations.map((operation) =>
        operation.id !== activeOperation.id
          ? operation
          : {
              ...operation,
              receiptBatches: operation.receiptBatches.map((batch) =>
                batch.id === batchId ? { ...batch, confirmed } : batch,
              ),
            },
      ),
    }));
  };

  const setCurrentOperator = (userId: string) => {
    if (!activeOperation) return;
    setAppState((current) => ({
      ...current,
      operations: current.operations.map((operation) =>
        operation.id === activeOperation.id ? { ...operation, currentOperatorUserId: userId } : operation,
      ),
    }));
  };

  const setClosingFinancialValue = (field: 'machineTotal' | 'cashCounted', rawValue: string) => {
    if (!activeOperation) return;
    const value = parseOptionalCurrency(rawValue);
    setAppState((current) => ({
      ...current,
      operations: current.operations.map((operation) => operation.id === activeOperation.id
        ? { ...operation, closingFinancial: { ...operation.closingFinancial, [field]: value } }
        : operation),
    }));
  };

  const cancelClosure = () => {
    if (!activeOperation) return;
    const hasDraft = Object.values(activeOperation.closingCountDraft ?? {}).some((quantity) => quantity > 0);
    if (hasDraft && !window.confirm('Sair do fechamento e descartar a contagem final ainda não confirmada?')) return;
    setAppState((current) => ({
      ...current,
      operations: current.operations.map((operation) =>
        operation.id === activeOperation.id
          ? { ...operation, status: 'open', closingStep: undefined, closingCountDraft: undefined }
          : operation,
      ),
    }));
    setScreen('home');
  };

  const returnToFinalCount = () => {
    if (!activeOperation?.finalCount) return;
    setAppState((current) => ({
      ...current,
      operations: current.operations.map((operation) =>
        operation.id === activeOperation.id
          ? { ...operation, closingStep: 'final_count', closingCountDraft: { ...activeOperation.finalCount!.countedStock }, finalCount: undefined }
          : operation,
      ),
    }));
    setFinalCountDraft({ ...activeOperation.finalCount.countedStock });
    setScreen('closing-count');
  };

  if (screen === 'login') {
    return (
      <div className="app-shell">
        <div className="login-card">
          <p className="eyebrow">Bar operations prototype</p>
          <h1>Controle operacional</h1>
          <p className="lead">Acompanhe aberturas, lançamentos, parciais e fechamento de operação em um fluxo pensado para operação em campo.</p>

          <label className="field-label" htmlFor="user-select">Usuário</label>
          <select id="user-select" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
            {mockUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>

          <button type="button" className="primary-button" onClick={handleLogin}>Entrar</button>
        </div>
      </div>
    );
  }

  if (!activeOperation && screen === 'open-operation') {
    return (
      <div className="app-shell">
        <div className="sheet">
          <header className="topbar">
            <BackButton onClick={() => { setAppState((current) => ({ ...current, currentUserId: null })); setScreen('login'); }} />
            <div>
              <p className="eyebrow">Abertura</p>
              <h2>Nova operação</h2>
            </div>
          </header>

          <div className="summary-box">
            <div>
              <span>Local</span>
              <strong>{mockVenue.name}</strong>
            </div>
            <div>
              <span>Evento</span>
              <strong>{mockEvent.name}</strong>
            </div>
            <div>
              <span>Ponto</span>
              <strong>{mockPointOfSale.name}</strong>
            </div>
          </div>

          <ProductCountEditor products={mockProducts} values={openingStock} onChange={(productId, value) => setProductValue(setOpeningStock, productId, value)} />

          <div className="bottom-action-bar">
            <button type="button" className="primary-button full-width" onClick={handleOpenOperation}>Abrir operação</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'operator-selection' && activeOperation) {
    return (
      <div className="app-shell">
        <div className="sheet operator-card">
          <p className="eyebrow">{mockEvent.name}</p>
          <h2>Quem vai operar agora?</h2>
          <div className="operator-options">
            {mockUsers.map((user) => (
              <button key={user.id} type="button" className="secondary-button" onClick={() => { setCurrentOperator(user.id); setScreen('home'); }}>
                {user.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'home' && activeOperation) {
    const operationMetrics = activeOperation.movements.length;
    const partialCount = activeOperation.partials.length;

    return (
      <div className="app-shell">
        <div className="sheet">
          <header className="topbar header-block">
            <div>
              <p className="eyebrow">Operação aberta</p>
              <h2>{mockEvent.name}</h2>
              <small>{mockPointOfSale.name}</small>
            </div>
            <span className="status-indicator online">Online</span>
          </header>

          <div className="meta-bar">
            <span>Aberto por {mockUsers.find((user) => user.id === activeOperation.openedByUserId)?.name ?? 'Usuário'} às {formatTime(activeOperation.openedAt)}</span>
            <button type="button" className="link-button" onClick={() => setScreen('history')}>Histórico</button>
          </div>

          <div className="operator-bar">
            <span>Operando como <strong>{mockUsers.find((user) => user.id === activeOperation.currentOperatorUserId)?.name}</strong></span>
            <button type="button" className="secondary-inline-button" onClick={() => { setPendingOperatorId(null); setHomeOverlay('operator'); }}>Trocar operador</button>
          </div>

          <div className="initial-stock-strip" aria-label="Carga inicial da operação">
            {activeProducts.map((product) => (
              <div key={product.id} className="stock-chip">
                <span>{product.name}</span>
                <strong>{activeOperation.initialStock[product.id]}</strong>
              </div>
            ))}
          </div>

          <div className="score-row">
            <button type="button" className="score-box" onClick={() => setHomeOverlay('movements')}>
              <span>{operationMetrics}</span>
              <small>Lançamentos</small>
            </button>
            <button type="button" className="score-box" onClick={() => setHomeOverlay('partials')}>
              <span>{partialCount}</span>
              <small>Parciais</small>
            </button>
          </div>

          <div className="action-stack">
            <button type="button" className="primary-button" onClick={() => setScreen('movement')}>Lançar</button>
            <button type="button" className="secondary-button" onClick={() => setScreen('transfer')}>Transferência</button>
            <button type="button" className="secondary-button" onClick={() => { setPartialCountDraft(createEmptyStock()); setScreen('partial-count'); }}>Fazer parcial</button>
            <button type="button" className="secondary-button danger" onClick={() => {
              const emptyCount = createEmptyStock();
              setFinalCountDraft(emptyCount);
              setAppState((current) => ({
                ...current,
                operations: current.operations.map((operation) =>
                  operation.id === activeOperation.id
                    ? { ...operation, status: 'closing', closingStep: 'final_count', closingCountDraft: emptyCount }
                    : operation,
                ),
              }));
              setScreen('closing-count');
            }}>Fechar operação</button>
          </div>

          <div className="floating-tools">
            <button type="button" className="link-button" onClick={resetDemo}>Resetar demonstração</button>
          </div>
        </div>

        {toast ? <TemporaryConfirmation toast={toast} onClose={() => setToast(null)} /> : null}
        {homeOverlay ? (
          <div className="overlay-backdrop" role="presentation" onMouseDown={() => setHomeOverlay(null)}>
            <section className="bottom-sheet" role="dialog" aria-modal="true" aria-label={homeOverlay === 'operator' ? 'Trocar operador' : homeOverlay === 'movements' ? 'Lançamentos' : 'Parciais'} onMouseDown={(event) => event.stopPropagation()}>
              <div className="sheet-handle" aria-hidden="true" />
              <header className="sheet-header">
                <h2>{homeOverlay === 'operator' ? 'Trocar operador' : homeOverlay === 'movements' ? 'Lançamentos' : 'Parciais'}</h2>
                <button type="button" className="close-button" onClick={() => setHomeOverlay(null)}>Fechar</button>
              </header>

              {homeOverlay === 'operator' ? (
                <div className="operator-options">
                  <p className="sheet-help">Selecione quem assumirá a operação. Uma confirmação será solicitada antes da troca.</p>
                  {mockUsers.map((user) => (
                    <button key={user.id} type="button" className={pendingOperatorId === user.id ? 'operator-option selected' : 'operator-option'} disabled={user.id === activeOperation.currentOperatorUserId} onClick={() => setPendingOperatorId(user.id)}>
                      {user.name}{user.id === activeOperation.currentOperatorUserId ? ' · atual' : ''}
                    </button>
                  ))}
                  {pendingOperatorId ? (
                    <div className="confirmation-box">
                      <p>Confirmar troca para <strong>{mockUsers.find((user) => user.id === pendingOperatorId)?.name}</strong>?</p>
                      <button type="button" className="primary-button" onClick={() => { setCurrentOperator(pendingOperatorId); setPendingOperatorId(null); setHomeOverlay(null); }}>Confirmar troca</button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {homeOverlay === 'movements' ? (
                <div className="sheet-list">
                  {activeOperation.movements.length > 0 ? [...activeOperation.movements].reverse().map((movement) => (
                    <div key={movement.id} className="sheet-list-row">
                      <div><strong>{movement.quantity} {mockProducts.find((product) => product.id === movement.productId)?.name}</strong><span>{getMovementLabel(movement.type)}</span></div>
                      <small>{formatTime(movement.timestamp)} · {mockUsers.find((user) => user.id === movement.userId)?.name}</small>
                    </div>
                  )) : <p className="empty-state">Nenhum lançamento registrado.</p>}
                </div>
              ) : null}

              {homeOverlay === 'partials' ? (
                <div className="sheet-list">
                  {activeOperation.partials.length > 0 ? [...activeOperation.partials].reverse().map((partial, reverseIndex) => {
                    const batches = activeOperation.receiptBatches.filter((batch) => batch.partialId === partial.id);
                    return <div key={partial.id} className="sheet-list-row"><div><strong>Parcial #{String(activeOperation.partials.length - reverseIndex).padStart(2, '0')}</strong><span>{batches.length} lotes · {batches.reduce((total, batch) => total + batch.receiptCount, 0)} comprovantes</span></div><small>{formatTime(partial.createdAt)} · {mockUsers.find((user) => user.id === partial.userId)?.name}</small></div>;
                  }) : <p className="empty-state">Nenhuma parcial registrada.</p>}
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>
    );
  }

  if (screen === 'movement' && activeOperation) {
    return (
      <div className="app-shell">
        <div className="sheet">
          <header className="topbar">
            <BackButton onClick={() => setScreen('home')} />
            <div>
              <p className="eyebrow">Lançar</p>
              <h2>Movimentação rápida</h2>
            </div>
          </header>

          <OperationContext operation={activeOperation} />

          <div className="segmented-control" role="tablist" aria-label="Tipos de lançamento">
            {(['courtesy', 'damage', 'restock'] as MovementType[]).map((type) => (
              <button
                key={type}
                type="button"
                className={movementType === type ? 'active' : ''}
                onClick={() => setMovementType(type)}
              >
                {getMovementLabel(type)}
              </button>
            ))}
          </div>

          <div className="product-grid">
            {activeProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                className="product-card"
                onClick={() => setProductValue(setMovementDraft, product.id, (movementDraft[product.id] ?? 0) + 1)}
              >
                <div className="placeholder" aria-hidden="true" />
                <div className="product-meta">
                  <strong>{product.name}</strong>
                </div>
                <span className="floating-badge">{movementDraft[product.id] ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="bottom-action-bar sticky-footer">
            <button type="button" className="primary-button full-width" onClick={applyMovement} disabled={movementTotal === 0}>
              Confirmar {movementTotal} item{movementTotal === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'transfer' && activeOperation) {
    return (
      <div className="app-shell">
        <div className="sheet">
          <header className="topbar">
            <BackButton onClick={() => setScreen('home')} />
            <div>
              <p className="eyebrow">{mockEvent.name}</p>
              <h2>Transferência</h2>
            </div>
          </header>

          <OperationContext operation={activeOperation} />

          <div className="segmented-control transfer-control" role="tablist" aria-label="Direção da transferência">
            <button type="button" className={transferType === 'transfer_in' ? 'active' : ''} onClick={() => setTransferType('transfer_in')}>Receber produtos</button>
            <button type="button" className={transferType === 'transfer_out' ? 'active' : ''} onClick={() => setTransferType('transfer_out')}>Enviar produtos</button>
          </div>

          <ProductCountEditor products={activeProducts} values={transferDraft} onChange={(productId, value) => setProductValue(setTransferDraft, productId, value)} />

          <div className="bottom-action-bar">
            <button type="button" className="primary-button full-width" onClick={applyMovement} disabled={movementTotal === 0}>
              Confirmar {movementTotal} item{movementTotal === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'partial-count' && activeOperation) {
    return (
      <div className="app-shell">
        <div className="sheet">
          <header className="topbar">
            <BackButton onClick={() => setScreen('home')} />
            <div>
              <p className="eyebrow">Parcial</p>
              <h2>Contagem física</h2>
            </div>
          </header>

          <OperationContext operation={activeOperation} />

          <div className="partial-stock-list">
            {activeProducts.map((product) => {
              const currentCount = Number(partialCountDraft[product.id] ?? 0);
              const { previousStock, periodOutput } = getPartialStockMetrics(activeOperation, product.id, currentCount);
              return (
                <div key={product.id} className="partial-stock-card">
                  <strong>{product.name}</strong>
                  <div className="partial-stock-data">
                    <span>Estoque anterior <b>{previousStock}</b></span>
                    <label>Contagem atual<input type="number" inputMode="numeric" min={0} value={currentCount} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setProductValue(setPartialCountDraft, product.id, Number(event.target.value || 0))} /></label>
                    <span>Saída no período <b>{periodOutput}</b></span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bottom-action-bar">
            <button type="button" className="primary-button full-width" onClick={() => setScreen('partial-batches')}>Continuar para notinhas</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'partial-batches' && activeOperation) {
    return (
      <div className="app-shell">
        <div className="sheet">
          <header className="topbar">
            <BackButton onClick={() => setScreen('partial-batches')} />
            <div>
              <p className="eyebrow">Parcial</p>
              <h2>Notinhas / comprovantes</h2>
            </div>
          </header>

          <OperationContext operation={activeOperation} />

          <div className="receipt-form">
            <label>
              Origem operacional (opcional)
              <select value={receiptDraft.source} onChange={(event) => setReceiptDraft((current) => ({ ...current, source: event.target.value }))}>
                {receiptSources.map((source) => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
            </label>

            <div className="two-column">
              <label>
                Nº de comprovantes
                <input type="number" min={0} value={receiptDraft.receiptCount} onChange={(event) => setReceiptDraft((current) => ({ ...current, receiptCount: Number(event.target.value || 0) }))} />
              </label>
              <label>
                Valor total das notinhas (opcional)
                <input type="text" value={receiptDraft.totalValue} onChange={(event) => setReceiptDraft((current) => ({ ...current, totalValue: event.target.value }))} placeholder="R$ 0,00" />
              </label>
            </div>

            <label>
              Observação
              <textarea value={receiptDraft.notes} onChange={(event) => setReceiptDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} />
            </label>

            <button type="button" className="secondary-button" onClick={() => addReceiptBatch('partial')}>Adicionar lote</button>
          </div>

          {partialBatches.length > 0 ? (
            <div className="receipt-list">
              {partialBatches.map((batch) => (
                <div key={batch.id} className="receipt-card">
                  <div>
                    <strong>Lote #{String(batch.sequenceNumber).padStart(2, '0')}</strong>
                    <p>{batch.source} · {formatTime(batch.timestamp)}</p>
                  </div>
                  <div>
                    <strong>{batch.receiptCount} comprovantes</strong>
                    <small>{batch.totalValue ? formatCurrency(batch.totalValue) : 'Valor não informado'}</small>
                  </div>
                  <button type="button" className="ghost-button" onClick={() => setPartialBatches((current) => current.filter((item) => item.id !== batch.id))}>Remover</button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="bottom-action-bar">
            <button type="button" className="primary-button full-width" onClick={() => setScreen('partial-summary')}>Continuar para financeiro</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'partial-summary' && activeOperation) {
    return (
      <div className="app-shell">
        <div className="sheet">
          <header className="topbar">
            <BackButton onClick={() => setScreen('partial-count')} />
            <div>
              <p className="eyebrow">Parcial</p>
              <h2>Financeiro e resumo</h2>
            </div>
          </header>

          <OperationContext operation={activeOperation} />

          <p className="flow-step">Informe os valores disponíveis. Estes dados ficam separados da contagem física e dos lotes de notinhas.</p>

          <div className="financial-fields">
            <label>Valores registrados nas máquinas (opcional)<input type="text" inputMode="decimal" placeholder="R$ 0,00" value={partialFinancialDraft.machineTotal} onChange={(event) => setPartialFinancialDraft((current) => ({ ...current, machineTotal: event.target.value }))} /></label>
            <label>Dinheiro físico contado (opcional)<input type="text" inputMode="decimal" placeholder="R$ 0,00" value={partialFinancialDraft.cashCounted} onChange={(event) => setPartialFinancialDraft((current) => ({ ...current, cashCounted: event.target.value }))} /></label>
          </div>

          <div className="partial-summary-sections">
            <div><span>Contagem física</span><strong>{activeProducts.length} produtos contados</strong></div>
            <div><span>Notinhas</span><strong>{partialBatches.length} lotes · {partialBatches.reduce((total, batch) => total + batch.receiptCount, 0)} comprovantes</strong></div>
            <div><span>Valor informado nos lotes</span><strong>{formatCurrency(partialBatches.reduce((total, batch) => total + (batch.totalValue ?? 0), 0))}</strong></div>
          </div>

          <div className="bottom-action-bar">
            <button type="button" className="primary-button full-width" onClick={confirmPartial}>Confirmar parcial</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'closing-count' && activeOperation) {
    return (
      <div className="app-shell">
        <div className="sheet">
          <header className="topbar">
            <BackButton onClick={cancelClosure} />
            <div>
              <p className="eyebrow">Fechamento</p>
              <h2>Contagem final cega</h2>
            </div>
          </header>

          <OperationContext operation={activeOperation} />

          <ProductCountEditor products={activeProducts} values={activeOperation.closingCountDraft ?? finalCountDraft} onChange={setFinalCountValue} />

          <div className="bottom-action-bar">
            <button type="button" className="primary-button full-width" onClick={finaliseClosure}>Finalizar contagem</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'closing-summary' && activeOperation) {
    return (
      <div className="app-shell">
        <div className="sheet">
          <header className="topbar">
            <BackButton onClick={returnToFinalCount} />
            <div>
              <p className="eyebrow">Fechamento</p>
              <h2>Conferência de estoque</h2>
            </div>
          </header>

          <OperationContext operation={activeOperation} />

          <div className="stock-review-list">
            {activeProducts.map((product) => {
              const expected = getExpectedStock(activeOperation, product.id);
              const counted = Number(activeOperation.finalCount?.countedStock[product.id] ?? 0);
              const difference = counted - expected;

              return (
                <div key={product.id} className="stock-review-card">
                  <strong>{product.name}</strong>
                  <div className="stock-review-values"><span>Esperado <b>{expected}</b></span><span>Contado <b>{counted}</b></span><span>Diferença <b>{difference > 0 ? `+${difference}` : difference}</b></span></div>
                  <span className={difference === 0 ? 'review-status ok' : 'review-status warning'}>{difference === 0 ? 'OK' : difference < 0 ? `Falta ${Math.abs(difference)}` : `Sobra ${difference}`}</span>
                </div>
              );
            })}
          </div>

          <div className="bottom-action-bar">
            <button type="button" className="primary-button full-width" onClick={() => setClosingStep('receipt_review', 'closing-receipts')}>Continuar para comprovantes</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'closing-receipts' && activeOperation) {
    const partialRows = activeOperation.partials;
    const allBatches = activeOperation.receiptBatches;
    const finalBatches = allBatches.filter((batch) => batch.period === 'final');
    const confirmedCount = allBatches.filter((batch) => batch.confirmed).length;

    return (
      <div className="app-shell">
        <div className="sheet">
          <header className="topbar">
            <BackButton onClick={() => setClosingStep('stock_review', 'closing-summary')} />
            <div>
              <p className="eyebrow">Fechamento</p>
              <h2>Conferência das notinhas</h2>
            </div>
          </header>

          <OperationContext operation={activeOperation} />

          <div className="progress-box">
            <strong>{confirmedCount} de {allBatches.length} lotes conferidos</strong>
          </div>

          {partialRows.length > 0 ? (
            <div className="receipt-list">
              <p className="section-label">Parciais</p>
              {partialRows.map((partial, index) => {
                const batches = activeOperation.receiptBatches.filter((batch) => batch.partialId === partial.id);
                return (
                  <div key={partial.id} className="receipt-card grouped">
                    <div className="receipt-header">
                      <strong>Parcial #{String(index + 1).padStart(2, '0')}</strong>
                      <small>{formatTime(partial.createdAt)}</small>
                    </div>
                    {batches.length > 0 ? batches.map((batch) => (
                      <label key={batch.id} className="batch-check">
                        <input
                          type="checkbox"
                          checked={closingConfirmedIds[batch.id] ?? batch.confirmed}
                          onChange={(event) => setBatchConfirmed(batch.id, event.target.checked)}
                        />
                        <span>
                          Lote #{String(batch.sequenceNumber).padStart(2, '0')} · {batch.source} · {batch.receiptCount} comprovantes · {formatTime(batch.timestamp)}
                        </span>
                      </label>
                    )) : <small>Sem lotes neste registro.</small>}
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="receipt-list">
            <p className="section-label">Período final</p>
            <div className="receipt-card grouped">
              {finalBatches.length > 0 ? finalBatches.map((batch) => (
                <label key={batch.id} className="batch-check">
                  <input
                    type="checkbox"
                    checked={closingConfirmedIds[batch.id] ?? batch.confirmed}
                    onChange={(event) => setBatchConfirmed(batch.id, event.target.checked)}
                  />
                  <span>Lote #{String(batch.sequenceNumber).padStart(2, '0')} · {batch.source} · {batch.receiptCount} comprovantes · {formatTime(batch.timestamp)}</span>
                </label>
              )) : <small>Nenhum lote adicionado neste período.</small>}
            </div>
          </div>

          <div className="receipt-form small">
            <label>
              Origem operacional (opcional)
              <select value={closingBatchDraft.source} onChange={(event) => setClosingBatchDraft((current) => ({ ...current, source: event.target.value }))}>
                {receiptSources.map((source) => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
            </label>
            <div className="two-column">
              <label>
                Nº de comprovantes
                <input type="number" min={0} value={closingBatchDraft.receiptCount} onChange={(event) => setClosingBatchDraft((current) => ({ ...current, receiptCount: Number(event.target.value || 0) }))} />
              </label>
              <label>
                Valor total das notinhas (opcional)
                <input type="text" value={closingBatchDraft.totalValue} onChange={(event) => setClosingBatchDraft((current) => ({ ...current, totalValue: event.target.value }))} />
              </label>
            </div>
            <button type="button" className="secondary-button" onClick={() => addReceiptBatch('closing')}>Adicionar lote final</button>
          </div>

          <div className="financial-section">
            <h3>Financeiro informado</h3>
            <p>Valores de máquinas e dinheiro físico ficam separados dos lotes de notinhas.</p>
            <div className="financial-fields">
              <label>Valores registrados nas máquinas (opcional)<input type="text" inputMode="decimal" placeholder="R$ 0,00" value={activeOperation.closingFinancial?.machineTotal ?? ''} onChange={(event) => setClosingFinancialValue('machineTotal', event.target.value)} /></label>
              <label>Dinheiro físico contado (opcional)<input type="text" inputMode="decimal" placeholder="R$ 0,00" value={activeOperation.closingFinancial?.cashCounted ?? ''} onChange={(event) => setClosingFinancialValue('cashCounted', event.target.value)} /></label>
            </div>
          </div>

          <div className="bottom-action-bar">
            <button type="button" className="primary-button full-width" onClick={() => setClosingStep('final_summary', 'final-summary')}>Ver resumo final</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'final-summary' && activeOperation) {
    const finalSummary = getOperationSummary(activeOperation);
    const allBatches = activeOperation.receiptBatches;
    const hasPendingBatches = allBatches.some((batch) => !batch.confirmed);
    const durationLabel = formatOperationDuration(activeOperation);
    const productMetrics = activeProducts.map((product) => ({ ...product, ...getProductFinalMetrics(activeOperation, product.id) }));
    const totalFinalStock = productMetrics.reduce((total, product) => total + product.final, 0);
    const totalInitialStock = productMetrics.reduce((total, product) => total + product.initial, 0);
    const totalPhysicalOutput = productMetrics.reduce((total, product) => total + product.physicalOutput, 0);
    const totalPresumedSales = productMetrics.reduce((total, product) => total + product.presumedSales, 0);
    const totalEstimatedValue = productMetrics.reduce((total, product) => total + product.presumedSales * product.basePrice, 0);
    const differenceCount = productMetrics.filter((product) => product.final !== getExpectedStock(activeOperation, product.id)).length;

    return (
      <div className="app-shell">
        <div className="sheet">
          <header className="topbar">
            <BackButton onClick={() => setClosingStep('receipt_review', 'closing-receipts')} />
            <div>
              <p className="eyebrow">Resumo final</p>
              <h2>Operação</h2>
            </div>
          </header>

          <OperationContext operation={activeOperation} />

          <div className="final-kpi-grid">
            <div><span>Estoque final</span><strong>{totalFinalStock}</strong></div>
            <div><span>Estoque inicial</span><strong>{totalInitialStock}</strong></div>
            <div><span>Saída física</span><strong>{totalPhysicalOutput}</strong></div>
            <div><span>Venda presumida</span><strong>{totalPresumedSales}</strong></div>
            <div className="estimated-value"><span>Valor estimado</span><strong>{formatCurrency(totalEstimatedValue)}</strong><small>Sem integração com vendas</small></div>
          </div>

          <h3 className="section-title">Estimativa por produto</h3>
          <div className="product-estimate-list">
            {productMetrics.map((product) => (
              <div key={product.id} className="product-estimate-row">
                <div><strong>{product.name}</strong><small>{product.presumedSales} presumidas × {formatCurrency(product.basePrice)}</small></div>
                <strong>{formatCurrency(product.presumedSales * product.basePrice)}</strong>
              </div>
            ))}
          </div>

          <h3 className="section-title">Operação e conferência</h3>
          <div className="detail-stack">
            <div className="detail-row"><span>Cortesias</span><strong>{finalSummary.courtesy}</strong></div>
            <div className="detail-row"><span>Perdas</span><strong>{finalSummary.damage}</strong></div>
            <div className="detail-row"><span>Reposições</span><strong>{finalSummary.restock}</strong></div>
            <div className="detail-row"><span>Transferências</span><strong>{finalSummary.transferIn} entrada · {finalSummary.transferOut} saída</strong></div>
            <div className="detail-row"><span>Diferenças</span><strong>{differenceCount === 0 ? 'Nenhuma' : `${differenceCount} produto${differenceCount === 1 ? '' : 's'}`}</strong></div>
            <div className="detail-row"><span>Parciais</span><strong>{activeOperation.partials.length}</strong></div>
            <div className="detail-row"><span>Lotes / comprovantes</span><strong>{allBatches.length} / {getTotalReceiptCount(activeOperation)}</strong></div>
            <div className="detail-row"><span>Valores nas máquinas</span><strong>{activeOperation.closingFinancial?.machineTotal !== undefined ? formatCurrency(activeOperation.closingFinancial.machineTotal) : 'Não informado'}</strong></div>
            <div className="detail-row"><span>Dinheiro físico</span><strong>{activeOperation.closingFinancial?.cashCounted !== undefined ? formatCurrency(activeOperation.closingFinancial.cashCounted) : 'Não informado'}</strong></div>
            <div className="detail-row"><span>Status de conferência</span><strong>{hasPendingBatches ? 'Pendente' : 'Todos os lotes conferidos'}</strong></div>
            <div className="detail-row"><span>Duração</span><strong>{durationLabel}</strong></div>
          </div>

          <div className="bottom-action-bar">
            {hasPendingBatches ? <p className="validation-message" role="status">Confira todos os lotes antes de finalizar.</p> : null}
            {hasPendingBatches ? <button type="button" className="secondary-button full-width" onClick={() => setClosingStep('receipt_review', 'closing-receipts')}>Voltar à conferência</button> : null}
            <button type="button" className="primary-button full-width" onClick={finalizeOperation} disabled={hasPendingBatches}>Finalizar operação</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'success' && activeOperation) {
    return (
      <div className="app-shell">
        <div className="sheet success-card">
          <h2>Operação finalizada</h2>
          <p>{mockEvent.name}</p>
          <strong>{mockPointOfSale.name}</strong>
          <button type="button" className="primary-button" onClick={() => { setAppState((current) => ({ ...current, activeOperationId: null })); setScreen('login'); }}>
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'history' && activeOperation) {
    const timeline = [
      ...activeOperation.movements.map((movement) => ({
        id: movement.id,
        type: 'movement' as const,
        label: `${movement.quantity} ${mockProducts.find((product) => product.id === movement.productId)?.name} · ${getMovementLabel(movement.type)} · ${mockUsers.find((user) => user.id === movement.userId)?.name ?? 'Usuário'}`,
        timestamp: movement.timestamp,
      })),
      ...activeOperation.partials.map((partial) => ({
        id: partial.id,
        type: 'partial' as const,
        label: `Parcial registrada · ${mockUsers.find((user) => user.id === partial.userId)?.name ?? 'Usuário'}`,
        timestamp: partial.createdAt,
      })),
    ].sort((first, second) => new Date(second.timestamp).getTime() - new Date(first.timestamp).getTime());

    return (
      <div className="app-shell">
        <div className="sheet">
          <header className="topbar">
            <BackButton onClick={() => setScreen('home')} />
            <div>
              <p className="eyebrow">Histórico</p>
              <h2>Operação atual</h2>
            </div>
          </header>

          <div className="timeline">
            {timeline.map((item) => (
              <div key={item.id} className="timeline-item">
                <strong>{formatTime(item.timestamp)}</strong>
                <span className={item.type === 'partial' ? 'partial-tag' : 'movement-tag'}>{item.label}</span>
              </div>
            ))}
          </div>

          <div className="bottom-action-bar">
            <button type="button" className="secondary-button full-width" onClick={() => setScreen('home')}>Voltar</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default App;
