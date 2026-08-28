import type { EventInfo, PointOfSale, Product, User, Venue } from '../types';

export const mockUsers: User[] = [
  { id: 'ana', name: 'Ana' },
  { id: 'bruno', name: 'Bruno' },
  { id: 'carlos', name: 'Carlos' },
];

export const mockVenue: Venue = { id: 'venue-demo', name: 'Espaço Demo' };
export const mockEvent: EventInfo = { id: 'event-demo', name: 'Noite Demo' };
export const mockPointOfSale: PointOfSale = { id: 'pos-bar-principal', name: 'Bar Principal' };

export const mockProducts: Product[] = [
  { id: 'beer', name: 'Cerveja Lager', unit: 'garrafa' },
  { id: 'water', name: 'Água', unit: 'garrafa' },
  { id: 'soda', name: 'Refrigerante', unit: 'lata' },
  { id: 'energy', name: 'Energético', unit: 'lata' },
  { id: 'gin', name: 'Gin', unit: 'garrafa' },
  { id: 'vodka', name: 'Vodka', unit: 'garrafa' },
];

export const movementTypeLabels: Record<string, string> = {
  courtesy: 'Cortesia',
  damage: 'Dano / perda',
  restock: 'Reposição',
  transfer_in: 'Transferência',
  transfer_out: 'Transferência',
};

export const receiptSources = ['Máquina A', 'Máquina B', 'Máquina Cortesia', 'Dinheiro', 'Outro'];

export function createEmptyStock(): Record<string, number> {
  return Object.fromEntries(mockProducts.map((product) => [product.id, 0]));
}
