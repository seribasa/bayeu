export type BaseResponse<T> = {
    is_successful: boolean;
    message: string;
    data?: T;
    error?: T;
};
