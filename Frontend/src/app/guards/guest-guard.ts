import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

export const guestGuard: CanActivateFn = (route, state) => {
  
  const router = inject(Router);
  const token = localStorage.getItem('authToken');

  if (token) {
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};
