import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Pause, Play, RefreshCw } from 'lucide-angular';

import { UI_CARD, UiButtonComponent } from '../ui';

interface LogEntry {
  id: number;
  timestamp: string;
  level: string;
  message: string;
  method?: string;
  path?: string;
  ip?: string;
}

@Component({
  selector: 'app-logs',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, ...UI_CARD, UiButtonComponent],
  templateUrl: './logs.html'
})
export class LogsComponent implements OnInit, OnDestroy {
  logs: LogEntry[] = [];
  totalLogs = 0;
  autoRefresh = true;
  readonly icons = { pause: Pause, play: Play, refresh: RefreshCw };
  private refreshInterval: any;

  ngOnInit() {
    this.loadLogs();
    this.startAutoRefresh();
  }

  ngOnDestroy() {
    this.stopAutoRefresh();
  }

  loadLogs() {
    fetch('/api/logs?limit=200')
      .then(res => res.json())
      .then(data => {
        this.logs = data.logs.reverse(); // Most recent first
        this.totalLogs = data.total;
      })
      .catch(err => console.error('Failed to load logs:', err));
  }

  startAutoRefresh() {
    if (this.refreshInterval) return;
    this.refreshInterval = setInterval(() => {
      if (this.autoRefresh) {
        this.loadLogs();
      }
    }, 2000); // Refresh every 2 seconds
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  toggleAutoRefresh() {
    this.autoRefresh = !this.autoRefresh;
    if (this.autoRefresh) {
      this.loadLogs();
    }
  }

  clearLogs() {
    // Note: This only clears the display, not server logs
    this.logs = [];
  }

  getLevelClass(level: string): string {
    switch (level) {
      case 'error': return 'text-red-600 bg-red-50';
      case 'warn': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-blue-600 bg-blue-50';
    }
  }

  getLevelIcon(level: string): string {
    switch (level) {
      case 'error': return '❌';
      case 'warn': return '⚠️';
      default: return 'ℹ️';
    }
  }

  formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour12: false });
  }
}
