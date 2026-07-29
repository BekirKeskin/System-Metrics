import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {

  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  username = '';
  password = '';

  login() {

    const loginData = {
      username: this.username,
      password: this.password
    };

    this.http.post<{success: boolean; message: string; token: string}>
    ('http://localhost:3000/login', loginData)
    .subscribe({
      next: (response) => {
        localStorage.setItem('authToken', response.token);
        this.router.navigate(['/dashboard']);
      },
      error: (error) => {
        console.log('Giriş hatası:', error);
      }
    });

  }
}
