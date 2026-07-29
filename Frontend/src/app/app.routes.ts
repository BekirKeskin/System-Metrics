import { Routes } from '@angular/router';
import { Login } from './login/login';
import { Dashboard } from './dashboard/dashboard';
import { authGuard } from './auth-guard';
import { guestGuard } from './guest-guard';

export const routes: Routes = [
    {
        path: '',
        redirectTo: 'login',
        pathMatch: 'full'
    },
    {
        path: "login",
        component: Login,
        canActivate: [guestGuard]
    },
    {
        path: "dashboard",
        component: Dashboard,
        canActivate: [authGuard]
    }
];
