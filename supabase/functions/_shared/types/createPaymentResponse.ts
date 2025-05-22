export type CreatePaymentResponse = {
    order_id?: string;
    gateway?: string;
    token?: string;
    redirect_url?: string;
};