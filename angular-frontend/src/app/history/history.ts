import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, History, User, Package } from 'lucide-angular';

import { UI_CARD, UiBadgeComponent } from '../ui';

interface HistoryEntry {
  // Null when the confirmation page did not expose a usable order number; the
  // order was still placed, so the entry is kept rather than dropped.
  orderNumber: string | null;
  date: string;
  environment?: 'dev' | 'staging';
  products: { productId: string; quantity: number; variant?: string }[];
  customer: string;
  total: string;
}

@Component({
  selector: 'app-history',
  imports: [CommonModule, LucideAngularModule, ...UI_CARD, UiBadgeComponent],
  templateUrl: './history.html',
  styleUrl: './history.css',
})
export class HistoryComponent implements OnInit {
  history: HistoryEntry[] = [];
  readonly icons = { history: History, customer: User, product: Package };
  loading = true;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.http.get<HistoryEntry[]>('/api/order-history').subscribe({
      next: data => {
        this.history = [...data].reverse();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }
}
