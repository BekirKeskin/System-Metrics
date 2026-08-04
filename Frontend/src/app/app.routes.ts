import { Routes } from '@angular/router';
import { Login } from './login/login';
import { Admin } from './admin/admin';
import { Dashboard } from './dashboard/dashboard';
import { authGuard } from './guards/auth-guard';
import { guestGuard } from './guards/guest-guard';
import { adminGuard } from './guards/admin-guard';

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
    },
    {
        path: "admin",
        component: Admin,
        canActivate: [authGuard, adminGuard]
    }
];
