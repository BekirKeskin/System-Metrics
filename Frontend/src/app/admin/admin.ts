import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
})
export class Admin implements OnInit {
  private readonly http = inject(HttpClient);

  username = "";
  name = "";
  surname = "";
  email = "";
  password = "";

  recipientUserId: number | null = null;
  metricType = '';
  threshold: number | null = null;
  severity = '';

  users: {id: number; username: string; name: string; surname: string; email: string;
    role: string; is_active: boolean;}[] = [];

  addUser(){
    const userData = {
      username: this.username,
      name: this.name,
      surname: this.surname,
      email: this.email,
      password: this.password
    }

    this.http.post<{success: boolean; message:string; user:{id:number; username:string; name:string;
      surname:string; email:string; role:string; is_active:boolean; created_at:string;};}>
    ('http://localhost:3000/admin/users', userData)
    .subscribe({
      next: (response) => {
        
        console.log(response.message);

        this.username = '';
        this.name = '';
        this.surname = '';
        this.email = '';
        this.password = '';

        this.getUsers();
      },
      error: (error) => {
        console.log('Ekleme hatası:', error);
      }
    });
  }

  getUsers(){
    this.http.get<{success: boolean; message: string; users:{id: number; username: string; name: string;
      surname: string; email: string; role: string; is_active: boolean;}[];}>
    ('http://localhost:3000/admin/users')
    .subscribe({
      next: (response) => {
        console.log("Gelen kullanıcılar:", response.users);
        this.users = response.users;
      },
      error: (error) => {
        console.log("Kullanıcılar getirilemedi:", error);
      }
    });
  }

  addAlarm(){

    const alarmData = {
      recipientUserId: this.recipientUserId,
      metricType: this.metricType,
      threshold: this.threshold,
      severity: this.severity,
    };

    this.http.post<{success: boolean; message: string; alarm: {id: number; recipientUserId: number;
      metric_type: string; threshold: string; severity: string; is_active: boolean; created_at: string;};}>
    ('http://localhost:3000/admin/alarms', alarmData)
    .subscribe({
      next: (response) => {
        console.log(response.message);

        this.recipientUserId = null;
        this.metricType = '';
        this.threshold = null;
        this.severity = '';
      },
      error: (error) => {
        console.log("Alarm eklenemedi !!!", error);
      }
    });
  }

  ngOnInit(): void {
    this.getUsers();
  }
}
