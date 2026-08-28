import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react';
import { createEmptyStock, mockEvent, mockPointOfSale, mockProducts, mockUsers, mockVenue, movementTypeLabels, receiptSources } from './data/mock';
import { storageService } from './services/storageService';
import type { AppState, Movement, MovementType, Operation, PartialCount, ReceiptBatch } from './types';
import './styles.css';

type Screen =
  | 'login'
  | 'open-operation'
  | 'home'
  | 'movement'
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

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);

const getMovementLabel = (type: MovementType): string => movementTypeLabels[type] ?? type;

const sumStock = (record: Record<string, number> | undefined) =>
  Object.values(record ?? {}).reduce((total, value) => total + (Number(value) || 0), 0);

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

function ProductCountEditor({
  values,
  onChange,
}: {
  values: Record<string, number>;
  onChange: (productId: string, value: number) => void;
}) {
  return (
    <div className="product-grid">
      {mockProducts.map((product) => (
        <div key={product.id} className="product-card compact">
          <div className="placeholder" aria-hidden="true" />
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
              min={0}
              value={values[product.id] ?? 0}
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
  const [movementType, setMovementType] = useState<MovementType>('courtesy');
  const [partialCountDraft, setPartialCountDraft] = useState<Record<string, number>>(createEmptyStock());
  const [receiptDraft, setReceiptDraft] = useState({ source: receiptSources[0], receiptCount: 0, totalValue: '', notes: '' });
  const [partialBatches, setPartialBatches] = useState<ReceiptBatch[]>([]);
  const [finalCountDraft, setFinalCountDraft] = useState<Record<string, number>>(createEmptyStock());
  const [closingBatchDraft, setClosingBatchDraft] = useState({ source: receiptSources[0], receiptCount: 0, totalValue: '', notes: '' });
  const [closingConfirmedIds, setClosingConfirmedIds] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<ToastState | null>(null);

  const activeOperation = useMemo(
    () => storageService.getActiveOperation(appState) ?? null,
    [appState],
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
          return 'home';
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

  const selectedProducts = mockProducts.filter((product) => (movementDraft[product.id] ?? 0) > 0);
  const movementTotal = selectedProducts.reduce((sum, product) => sum + (movementDraft[product.id] ?? 0), 0);

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
      userId: appState.currentUserId,
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
    setScreen('home');
  };

  const applyMovement = () => {
    if (!activeOperation || selectedProducts.length === 0) {
      return;
    }

    const createdMovements: Movement[] = selectedProducts.flatMap((product) => {
      const quantity = movementDraft[product.id] ?? 0;
      if (quantity <= 0) {
        return [];
      }

      return [
        {
          id: createId('movement'),
          operationId: activeOperation.id,
          productId: product.id,
          type: movementType,
          quantity,
          timestamp: new Date().toISOString(),
          userId: activeOperation.userId,
        },
      ];
    });

    const message =
      createdMovements.length === 1
        ? `✓ ${mockProducts.find((product) => product.id === createdMovements[0].productId)?.name} registrada como ${getMovementLabel(movementType)}`
        : `✓ ${createdMovements.length} itens registrados como ${getMovementLabel(movementType)}`;

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

    setMovementDraft(createEmptyStock());
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
      source: draft.source,
      receiptCount: count,
      totalValue: draft.totalValue ? Number(draft.totalValue.replace(',', '.')) : undefined,
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
              receiptBatches: [...operation.receiptBatches, ...partialBatches.map((batch) => ({ ...batch, partialId: partial.id, operationId: activeOperation.id }))],
            },
      ),
    }));

    setToast({
      message: `✓ Parcial registrada às ${formatTime(new Date().toISOString())}`,
    });
    setPartialBatches([]);
    setScreen('home');
  };

  const finaliseClosure = () => {
    if (!activeOperation) {
      return;
    }

    const finalCount = {
      id: createId('final-count'),
      operationId: activeOperation.id,
      countedStock: { ...finalCountDraft },
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
              finalCount,
            },
      ),
    }));
    setScreen('closing-summary');
  };

  const finalizeOperation = () => {
    if (!activeOperation) {
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
    setPartialCountDraft(createEmptyStock());
    setFinalCountDraft(createEmptyStock());
    setPartialBatches([]);
    setClosingBatchDraft({ source: receiptSources[0], receiptCount: 0, totalValue: '', notes: '' });
    setToast(null);
  };

  const partialTotalReceipts = partialBatches.reduce((sum, batch) => sum + batch.receiptCount, 0);

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

          <ProductCountEditor values={openingStock} onChange={(productId, value) => setProductValue(setOpeningStock, productId, value)} />

          <div className="bottom-action-bar">
            <button type="button" className="primary-button full-width" onClick={handleOpenOperation}>Abrir operação</button>
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
            <span>Aberto às {formatTime(activeOperation.openedAt)}</span>
            <button type="button" className="link-button" onClick={() => setScreen('history')}>Histórico</button>
          </div>

          <div className="score-row">
            <div className="score-box">
              <span>{operationMetrics}</span>
              <small>Lançamentos</small>
            </div>
            <div className="score-box">
              <span>{partialCount}</span>
              <small>Parciais</small>
            </div>
          </div>

          <div className="action-stack">
            <button type="button" className="primary-button" onClick={() => setScreen('movement')}>Lançar</button>
            <button type="button" className="secondary-button" onClick={() => { setPartialCountDraft({ ...activeOperation.initialStock }); setScreen('partial-count'); }}>Fazer parcial</button>
            <button type="button" className="secondary-button danger" onClick={() => { setFinalCountDraft(createEmptyStock()); setScreen('closing-count'); }}>Fechar operação</button>
          </div>

          <div className="floating-tools">
            <button type="button" className="link-button" onClick={resetDemo}>Resetar demonstração</button>
          </div>
        </div>

        {toast ? <TemporaryConfirmation toast={toast} onClose={() => setToast(null)} /> : null}
      </div>
    );
  }

  if (screen === 'movement' && activeOperation) {
    return (
      <div className="app-shell">
        <div className="sheet">
          <header className="topbar">
            <div>
              <p className="eyebrow">Lançar</p>
              <h2>Movimentação rápida</h2>
            </div>
          </header>

          <div className="segmented-control" role="tablist" aria-label="Tipos de lançamento">
            {(['courtesy', 'damage', 'restock', 'transfer_in', 'transfer_out'] as MovementType[]).map((type) => (
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
            {mockProducts.map((product) => (
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

  if (screen === 'partial-count' && activeOperation) {
    return (
      <div className="app-shell">
        <div className="sheet">
          <header className="topbar">
            <div>
              <p className="eyebrow">Parcial</p>
              <h2>Contagem física</h2>
            </div>
          </header>

          <ProductCountEditor values={partialCountDraft} onChange={(productId, value) => setProductValue(setPartialCountDraft, productId, value)} />

          <div className="bottom-action-bar">
            <button type="button" className="primary-button full-width" onClick={() => setScreen('partial-batches')}>Continuar</button>
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
            <div>
              <p className="eyebrow">Parcial</p>
              <h2>Notinhas / comprovantes</h2>
            </div>
          </header>

          <div className="receipt-form">
            <label>
              Origem
              <select value={receiptDraft.source} onChange={(event) => setReceiptDraft((current) => ({ ...current, source: event.target.value }))}>
                {receiptSources.map((source) => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
            </label>

            <div className="two-column">
              <label>
                Quantidade
                <input type="number" min={0} value={receiptDraft.receiptCount} onChange={(event) => setReceiptDraft((current) => ({ ...current, receiptCount: Number(event.target.value || 0) }))} />
              </label>
              <label>
                Valor total
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
              {partialBatches.map((batch, index) => (
                <div key={batch.id} className="receipt-card">
                  <div>
                    <strong>Lote #{String(index + 1).padStart(2, '0')}</strong>
                    <p>{batch.source}</p>
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
            <button type="button" className="primary-button full-width" onClick={() => setScreen('partial-summary')}>Resumo da parcial</button>
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
            <div>
              <p className="eyebrow">Parcial</p>
              <h2>Resumo</h2>
            </div>
          </header>

          <div className="summary-box compact">
            <div>
              <span>Horário</span>
              <strong>{formatDateTime(new Date().toISOString())}</strong>
            </div>
            <div>
              <span>Lotes</span>
              <strong>{partialBatches.length}</strong>
            </div>
            <div>
              <span>Comprovantes</span>
              <strong>{partialTotalReceipts}</strong>
            </div>
          </div>

          <div className="detail-stack">
            {mockProducts.map((product) => (
              <div key={product.id} className="detail-row">
                <span>{product.name}</span>
                <strong>{partialCountDraft[product.id] ?? 0}</strong>
              </div>
            ))}
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
            <div>
              <p className="eyebrow">Fechamento</p>
              <h2>Contagem final cega</h2>
            </div>
          </header>

          <ProductCountEditor values={finalCountDraft} onChange={(productId, value) => setProductValue(setFinalCountDraft, productId, value)} />

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
            <div>
              <p className="eyebrow">Fechamento</p>
              <h2>Conferência de estoque</h2>
            </div>
          </header>

          <div className="detail-stack">
            {mockProducts.map((product) => {
              const expected = Number((Object.fromEntries(mockProducts.map((item) => [item.id, getExpectedStock(activeOperation, item.id)]))[product.id] ?? 0));
              const counted = Number(finalCountDraft[product.id] ?? 0);
              const difference = counted - expected;

              return (
                <div key={product.id} className="detail-row status-row">
                  <div>
                    <span>{product.name}</span>
                    <small>Esperado {expected}</small>
                  </div>
                  <div className="right-side">
                    <strong>{counted}</strong>
                    <span className={difference > 0 ? 'status-positive' : difference < 0 ? 'status-negative' : 'status-neutral'}>
                      {difference > 0 ? 'Sobra' : difference < 0 ? 'Falta' : 'Bateu'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bottom-action-bar">
            <button type="button" className="primary-button full-width" onClick={() => setScreen('closing-receipts')}>Continuar</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'closing-receipts' && activeOperation) {
    const partialRows = activeOperation.partials;
    const allBatches = activeOperation.receiptBatches;
    const confirmedCount = allBatches.filter((batch) => batch.confirmed).length;

    return (
      <div className="app-shell">
        <div className="sheet">
          <header className="topbar">
            <div>
              <p className="eyebrow">Fechamento</p>
              <h2>Conferência das notinhas</h2>
            </div>
          </header>

          <div className="progress-box">
            <strong>{confirmedCount} de {allBatches.length} lotes conferidos</strong>
          </div>

          {partialRows.length > 0 ? (
            <div className="receipt-list">
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
                          onChange={(event) => {
                            setClosingConfirmedIds((current) => ({ ...current, [batch.id]: event.target.checked }));
                            setAppState((currentState) => ({
                              ...currentState,
                              operations: currentState.operations.map((operation) =>
                                operation.id !== activeOperation.id
                                  ? operation
                                  : {
                                      ...operation,
                                      receiptBatches: operation.receiptBatches.map((item) =>
                                        item.id === batch.id ? { ...item, confirmed: event.target.checked } : item,
                                      ),
                                    },
                              ),
                            }));
                          }}
                        />
                        <span>
                          {batch.source} · {batch.receiptCount} comprovantes
                        </span>
                      </label>
                    )) : <small>Sem lotes neste registro.</small>}
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="receipt-form small">
            <label>
              Origem
              <select value={closingBatchDraft.source} onChange={(event) => setClosingBatchDraft((current) => ({ ...current, source: event.target.value }))}>
                {receiptSources.map((source) => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
            </label>
            <div className="two-column">
              <label>
                Quantidade
                <input type="number" min={0} value={closingBatchDraft.receiptCount} onChange={(event) => setClosingBatchDraft((current) => ({ ...current, receiptCount: Number(event.target.value || 0) }))} />
              </label>
              <label>
                Valor total
                <input type="text" value={closingBatchDraft.totalValue} onChange={(event) => setClosingBatchDraft((current) => ({ ...current, totalValue: event.target.value }))} />
              </label>
            </div>
            <button type="button" className="secondary-button" onClick={() => addReceiptBatch('closing')}>Adicionar lote final</button>
          </div>

          <div className="bottom-action-bar">
            <button type="button" className="primary-button full-width" onClick={() => setScreen('final-summary')}>Ver resumo final</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'final-summary' && activeOperation) {
    const finalSummary = getOperationSummary(activeOperation);
    const allBatches = activeOperation.receiptBatches;
    const duration = activeOperation.closedAt ? new Date(activeOperation.closedAt).getTime() - new Date(activeOperation.openedAt).getTime() : 0;
    const hours = Math.floor(duration / 3600000);
    const minutes = Math.floor((duration % 3600000) / 60000);

    return (
      <div className="app-shell">
        <div className="sheet">
          <header className="topbar">
            <div>
              <p className="eyebrow">Resumo final</p>
              <h2>Operação</h2>
            </div>
          </header>

          <div className="summary-box compact">
            <div>
              <span>Operação</span>
              <strong>{mockEvent.name}</strong>
            </div>
            <div>
              <span>Ponto</span>
              <strong>{mockPointOfSale.name}</strong>
            </div>
            <div>
              <span>Duração</span>
              <strong>{hours}h {minutes}m</strong>
            </div>
          </div>

          <div className="detail-stack">
            <div className="detail-row"><span>Estoque inicial</span><strong>{sumStock(activeOperation.initialStock)}</strong></div>
            <div className="detail-row"><span>Total cortesias</span><strong>{finalSummary.courtesy}</strong></div>
            <div className="detail-row"><span>Total danos</span><strong>{finalSummary.damage}</strong></div>
            <div className="detail-row"><span>Total reposições</span><strong>{finalSummary.restock}</strong></div>
            <div className="detail-row"><span>Transferências</span><strong>{finalSummary.transferIn + finalSummary.transferOut}</strong></div>
            <div className="detail-row"><span>Parciais</span><strong>{activeOperation.partials.length}</strong></div>
            <div className="detail-row"><span>Lotes</span><strong>{allBatches.length}</strong></div>
            <div className="detail-row"><span>Comprovantes</span><strong>{getTotalReceiptCount(activeOperation)}</strong></div>
          </div>

          <div className="bottom-action-bar">
            <button type="button" className="primary-button full-width" onClick={finalizeOperation}>Finalizar operação</button>
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
        label: `${movement.quantity} ${mockProducts.find((product) => product.id === movement.productId)?.name} · ${getMovementLabel(movement.type)}`,
        timestamp: movement.timestamp,
      })),
      ...activeOperation.partials.map((partial) => ({
        id: partial.id,
        type: 'partial' as const,
        label: `Parcial registrada`,
        timestamp: partial.createdAt,
      })),
    ].sort((first, second) => new Date(second.timestamp).getTime() - new Date(first.timestamp).getTime());

    return (
      <div className="app-shell">
        <div className="sheet">
          <header className="topbar">
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
