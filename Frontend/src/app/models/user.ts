export interface User {
    id: number;
    username: string;
    name: string;
    surname: string;
    email: string;
    role: string;
    is_active: boolean;
    created_at?: string;
}