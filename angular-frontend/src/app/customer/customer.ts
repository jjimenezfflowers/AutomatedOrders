import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

interface OrderConfig {
  deliveryDate?: string;
  customerInfo: {
    email: string;
    phone: string;
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
  payment: {
    cardNumber: string;
    cvv: string;
    expiry: string;
  };
  orders?: any[];
}

@Component({
  selector: 'app-customer',
  imports: [FormsModule, CommonModule],
  templateUrl: './customer.html',
  styleUrl: './customer.css',
})
export class CustomerComponent implements OnInit {
  customerInfo = {
    email: '',
    phone: '',
    firstName: '',
    lastName: '',
    address: '',
    city: '',
    state: '',
    zipCode: ''
  };

  payment = {
    cardNumber: '',
    cvv: '',
    expiry: ''
  };

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadCustomerInfo();
  }

  loadCustomerInfo() {
    this.http.get<Partial<OrderConfig>>('/api/order-config').subscribe(data => {
      if (data.customerInfo) {
        this.customerInfo = { ...data.customerInfo };
      }
      if (data.payment) {
        this.payment = { ...data.payment };
      }
    });
  }

  saveCustomerInfo() {
    this.http.get<Partial<OrderConfig>>('/api/order-config').subscribe(currentConfig => {
      const updatedConfig: Partial<OrderConfig> = {
        ...currentConfig,
        customerInfo: this.customerInfo,
        payment: this.payment
      };

      this.http.post('/api/order-config', updatedConfig).subscribe(() => {
        alert('Customer info saved!');
      });
    });
  }
}
