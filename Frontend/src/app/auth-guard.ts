import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';


export const authGuard: CanActivateFn = (route, state) => {

  const router = inject(Router);
  const token = localStorage.getItem('authToken');

  if(token === 'system-metrics-auth-token') {
    return true;
  }

  return router.createUrlTree(['/login']);
};
