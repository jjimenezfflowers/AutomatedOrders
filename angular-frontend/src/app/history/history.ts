import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

interface HistoryEntry {
  orderNumber: string;
  date: string;
  environment?: 'dev' | 'staging';
  products: { productId: string; quantity: number; variant?: string }[];
  customer: string;
  total: string;
}

@Component({
  selector: 'app-history',
  imports: [CommonModule],
  templateUrl: './history.html',
  styleUrl: './history.css',
})
export class HistoryComponent implements OnInit {
  history: HistoryEntry[] = [];
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
