import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { User } from '../models/user';
import { Alarm } from '../models/alarm';
import { Socket } from '../services/socket';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
})
export class Admin implements OnInit {

  private readonly http = inject(HttpClient);
  private readonly socketService = inject(Socket);

  servers = this.socketService.servers;
  selectedServerId = this.socketService.selectedServerId;

  users = signal<User[]>([]);
  alarms = signal<Alarm[]>([]);
  editingAlarmId = signal<number | null>(null);

  username = "";
  name = "";
  surname = "";
  email = "";
  password = "";

  recipientUserId: number | null = null;
  metricType = '';
  threshold: number | null = null;
  severity = '';

  editServerId: number | null = null;
  editRecipientUserId: number | null = null;
  editMetricType = '';
  editThreshold: number | null = null;
  editSeverity = '';
  editIsActive = true;
  
  
  addUser(): void{
    const userData = {
      username: this.username,
      name: this.name,
      surname: this.surname,
      email: this.email,
      password: this.password
    }

    this.http.post<{success: boolean; message: string; user: User;}>
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

  getUsers(): void{
    this.http.get<{success: boolean; message: string; users: User[];}>
    ('http://localhost:3000/admin/users')
    .subscribe({
      next: (response) => {
        console.log("Gelen kullanıcılar:", response.users);
        this.users.set(response.users);
      },
      error: (error) => {
        console.log("Kullanıcılar getirilemedi:", error);
      }
    });
  }

  selectAlarmServer(serverId: number | string): void {
    this.socketService.selectServer(serverId);
  }

  getServerName(serverId: number): string {
    const server = this.servers().find(
      server => server.id === serverId
    );

    if (!server) {
      return `Sunucu ${serverId}`;
    }
    return `${server.hostname} - ${server.os}`;
  }

  addAlarm(): void{

    const serverId = this.socketService.selectedServerId();

    if (serverId === null) {
      console.log("Alarm için sunucu seçilmedi.");
      return;
    }

    const alarmData = {
      serverId,
      recipientUserId: this.recipientUserId,
      metricType: this.metricType,
      threshold: this.threshold,
      severity: this.severity,
    };

    this.http.post<{success: boolean; message: string; alarm: {id: number; recipient_user_id: number;
      metric_type: string; threshold: string; severity: string; is_active: boolean; created_at: string;};}>
    ('http://localhost:3000/admin/alarms', alarmData)
    .subscribe({
      next: (response) => {
        console.log(response.message);

        this.recipientUserId = null;
        this.metricType = '';
        this.threshold = null;
        this.severity = '';

        this.getAlarms();
      },
      error: (error) => {
        console.log("Alarm eklenemedi !!!", error);
      }
    });
  }

  getAlarms(): void{
    this.http.get<{success: boolean; message: string; alarms: Alarm[];}>
    ('http://localhost:3000/admin/alarms')
    .subscribe({
      next: (response) => {
        console.log("Gelen alarmlar:", response.alarms);
        this.alarms.set(response.alarms);
      },
      error: (error) => {
        console.log("Alarmlar getirilemedi:", error);
      }
    });
  }

  startEditingAlarm(alarm: Alarm): void {
    this.editingAlarmId.set(alarm.id);

    this.editServerId = alarm.server_id;
    this.editRecipientUserId = alarm.recipient_user_id;
    this.editMetricType = alarm.metric_type;
    this.editThreshold = Number(alarm.threshold);
    this.editSeverity = alarm.severity;
    this.editIsActive = alarm.is_active;
  }

  cancelEditingAlarm(): void {
    this.editingAlarmId.set(null);

    this.editServerId = null;
    this.editRecipientUserId = null;
    this.editMetricType = '';
    this.editThreshold = null;
    this.editSeverity = '';
    this.editIsActive = true;
  }

  updateAlarm(): void {
    const alarmId = this.editingAlarmId();

    if (
      alarmId === null ||
      this.editServerId === null ||
      this.editRecipientUserId === null ||
      this.editThreshold === null ||
      !this.editMetricType ||
      !this.editSeverity
    ) {
      console.log('Güncellenecek alarm bilgileri eksik.');
      return;
    }

    const updatedAlarmData = {
      serverId: this.editServerId,
      recipientUserId: this.editRecipientUserId,
      metricType: this.editMetricType,
      threshold: this.editThreshold,
      severity: this.editSeverity,
      isActive: this.editIsActive
    };

    this.http.put<{success: boolean; message: string; alarm: {id: number; recipient_user_id: number; metric_type: string;
      threshold: string; severity: string; is_active: boolean; created_at: string;};}>
    (`http://localhost:3000/admin/alarms/${alarmId}`,updatedAlarmData)
    .subscribe({
      next: (response) => {
        console.log(response.message);

        this.cancelEditingAlarm();
        this.getAlarms();
      },
      error: (error) => {
        console.log('Alarm güncellenemedi:', error);
      }
    });
  }

  deleteAlarm(alarmId: number): void {
    const shouldDelete = window.confirm(
      'Bu alarmı silmek istediğinize emin misiniz?'
    );

    if (!shouldDelete) {
      return;
    }

    this.http.delete<{success: boolean; message: string; deletedAlarmId: number;}>
    (`http://localhost:3000/admin/alarms/${alarmId}`)
    .subscribe({
      next: (response) => {
        console.log(response.message);

        if (this.editingAlarmId() === alarmId) {
          this.cancelEditingAlarm();
        }

        this.getAlarms();
      },
      error: (error) => {
        console.log('Alarm silinemedi:', error);
      }
    });
  }

  ngOnInit(): void {
    this.getUsers();
    this.getAlarms();
  }
}
