import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

interface StagingConfig {
  stagingBaseUrl: string;
}

interface RunTestResponse {
  success: boolean;
  output?: string;
}

@Component({
  selector: 'app-staging',
  imports: [FormsModule, CommonModule],
  templateUrl: './staging.html',
  styleUrl: './staging.css',
})
export class StagingComponent implements OnInit {
  stagingConfig: StagingConfig = { stagingBaseUrl: '' };
  isRunning = false;
  testOutput = '';
  testSuccess: boolean | null = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadConfig();
  }

  loadConfig() {
    this.http.get<StagingConfig>('/api/staging-config').subscribe(data => {
      this.stagingConfig = data;
    });
  }

  saveConfig() {
    this.http.post('/api/staging-config', this.stagingConfig).subscribe(() => {
      alert('Staging config saved!');
    });
  }

  runStagingTest() {
    this.isRunning = true;
    this.testOutput = '';
    this.testSuccess = null;

    this.http.post<RunTestResponse>('/api/run-test', { staging: true }).subscribe({
      next: response => {
        this.isRunning = false;
        this.testSuccess = response.success;
        this.testOutput = response.output || '';
      },
      error: err => {
        this.isRunning = false;
        this.testSuccess = false;
        this.testOutput = err.message || 'Request failed';
      }
    });
  }
}
