import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';


export const authInterceptor: HttpInterceptorFn = (req, next) => {

  const http = inject(HttpClient);
  const router = inject(Router);

  const token = localStorage.getItem('authToken');


  const isAuthRequest =
    req.url.endsWith('/login') ||
    req.url.endsWith('/refresh') ||
    req.url.endsWith('/logout');


  let requestToSend = req;


  if (token && !isAuthRequest) {

    requestToSend = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }


  return next(requestToSend).pipe(

    catchError((error: HttpErrorResponse) => {

      if (
        error.status !== 401 ||
        isAuthRequest
      ) {
        return throwError(() => error);
      }


      return http.post<{
        success: boolean;
        message: string;
        token: string;
      }>(
        'http://localhost:3000/refresh',
        {},
        {
          withCredentials: true
        }
      ).pipe(

        switchMap((refreshResponse) => {

          localStorage.setItem(
            'authToken',
            refreshResponse.token
          );


          const retriedRequest = req.clone({
            setHeaders: {
              Authorization:
                `Bearer ${refreshResponse.token}`
            }
          });


          return next(retriedRequest);
        }),


        catchError((refreshError) => {

          localStorage.removeItem('authToken');
          localStorage.removeItem('userId');
          localStorage.removeItem('username');
          localStorage.removeItem('userRole');

          router.navigate(['/login']);

          return throwError(
            () => refreshError
          );
        })

      );
    })

  );
};