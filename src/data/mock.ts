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
  { id: 'beer', name: 'Cerveja Lager', unit: 'garrafa', basePrice: 10 },
  { id: 'water', name: 'Água', unit: 'garrafa', basePrice: 5 },
  { id: 'soda', name: 'Refrigerante', unit: 'lata', basePrice: 7 },
  { id: 'energy', name: 'Energético', unit: 'lata', basePrice: 12 },
  { id: 'gin', name: 'Gin', unit: 'garrafa', basePrice: 18 },
  { id: 'vodka', name: 'Vodka', unit: 'garrafa', basePrice: 18 },
];

export const movementTypeLabels: Record<string, string> = {
  courtesy: 'Cortesia',
  damage: 'Dano / perda',
  restock: 'Reposição',
  transfer_in: 'Recebimento',
  transfer_out: 'Envio',
};

export const receiptSources = ['Não informada', 'Balcão A', 'Balcão B', 'Equipe volante', 'Outro'];

export function createEmptyStock(): Record<string, number> {
  return Object.fromEntries(mockProducts.map((product) => [product.id, 0]));
}
