export interface Alarm {
    id: number;
    server_id: number;
    recipient_user_id: number;
    username: string;
    name: string;
    surname: string;
    metric_type: string;
    threshold: string;
    severity: string;
    is_active: boolean;
    created_at: string;
}