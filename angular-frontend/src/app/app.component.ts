import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductsComponent } from './products/products';
import { OrdersComponent } from './orders/orders';
import { CustomerComponent } from './customer/customer';
import { HistoryComponent } from './history/history';
import { StagingOrdersComponent } from './staging-orders/staging-orders';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ProductsComponent, OrdersComponent, CustomerComponent, HistoryComponent, StagingOrdersComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class AppComponent {
  activeTab: string = 'products';

  showTab(tab: string) {
    this.activeTab = tab;
  }
}
