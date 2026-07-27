import { Component, signal, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Socket } from './services/socket';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('Frontend');
  readonly socketService = inject(Socket);

}
