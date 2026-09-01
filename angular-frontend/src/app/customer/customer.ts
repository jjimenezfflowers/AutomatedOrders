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

  setAddress(region: 'CT' | 'HI' | 'AK' | 'NJ') {
    if (region === 'CT') {
      this.customerInfo.address = '124 Ben St';
      this.customerInfo.city = 'Bristol';
      this.customerInfo.state = 'CT';
      this.customerInfo.zipCode = '06830';
    } else if (region === 'NJ') {
      this.customerInfo.address = '179 Wall St';
      this.customerInfo.city = 'West Long Branch';
      this.customerInfo.state = 'NJ';
      this.customerInfo.zipCode = '07764';
    } else if (region === 'HI') {
      this.customerInfo.address = '58 Kapuaimilia Place';
      this.customerInfo.city = 'Maui County';
      this.customerInfo.state = 'Hawaii';
      this.customerInfo.zipCode = '96708';
    } else if (region === 'AK') {
      this.customerInfo.address = '5100 Whispering Spruce Drive';
      this.customerInfo.city = 'Anchorage';
      this.customerInfo.state = 'Alaska';
      this.customerInfo.zipCode = '99516';
    }
  }
}
