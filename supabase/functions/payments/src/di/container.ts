import { eImunisasiSupabaseAdmin } from "../../../_shared/eimunisasiSupabase.ts";
import { SupabaseOrderRepository } from "../infrastructure/repositories/SupabaseOrderRepository.ts";
import { SupabaseTenantRepository } from "../infrastructure/repositories/SupabaseTenantRepository.ts";
import { SupabaseProductRepository } from "../infrastructure/repositories/SupabaseProductRepository.ts";
import { JwtAuthService } from "../infrastructure/services/JwtAuthService.ts";
import { OutpostService } from "../infrastructure/services/OutpostService.ts";
import { GatewayAdapter } from "../infrastructure/gateways/GatewayAdapter.ts";
import { InitiatePaymentUseCase } from "../use_cases/InitiatePaymentUseCase.ts";
import { InitiateItemizedPaymentUseCase } from "../use_cases/InitiateItemizedPaymentUseCase.ts";
import { GetOrderUseCase } from "../use_cases/GetOrderUseCase.ts";
import { HandleRedirectUseCase } from "../use_cases/HandleRedirectUseCase.ts";
import { GetTransactionUseCase } from "../use_cases/GetTransactionUseCase.ts";
import { PaymentController } from "../presentation/controllers/PaymentController.ts";
import { OrderController } from "../presentation/controllers/OrderController.ts";
import { TransactionController } from "../presentation/controllers/TransactionController.ts";
import { WebhookController } from "../presentation/controllers/WebhookController.ts";
import { paymentSupabaseAdmin } from "../../../_shared/paymentSupabase.ts";

export const buildControllers = () => {
  const orderRepo = new SupabaseOrderRepository(paymentSupabaseAdmin);
  const tenantRepo = new SupabaseTenantRepository(paymentSupabaseAdmin);
  const productRepo = new SupabaseProductRepository(paymentSupabaseAdmin);
  const authService = new JwtAuthService(eImunisasiSupabaseAdmin);
  const outpostService = new OutpostService();
  const gatewayFactory = new GatewayAdapter();

  const initiatePaymentUseCase = new InitiatePaymentUseCase(
    orderRepo,
    tenantRepo,
    gatewayFactory,
    outpostService,
  );

  const initiateItemizedPaymentUseCase = new InitiateItemizedPaymentUseCase(
    orderRepo,
    productRepo,
    gatewayFactory,
  );

  const getOrderUseCase = new GetOrderUseCase(orderRepo);
  const handleRedirectUseCase = new HandleRedirectUseCase(
    orderRepo,
    outpostService,
  );
  const getTransactionUseCase = new GetTransactionUseCase(orderRepo);

  const paymentController = new PaymentController(
    initiatePaymentUseCase,
    authService,
  );
  const orderController = new OrderController(
    authService,
    initiateItemizedPaymentUseCase,
    getOrderUseCase,
    handleRedirectUseCase,
  );
  const transactionController = new TransactionController(
    authService,
    getTransactionUseCase,
  );
  const webhookController = new WebhookController(gatewayFactory);

  return {
    paymentController,
    orderController,
    transactionController,
    webhookController,
  };
};

export const controllers = buildControllers();
export const paymentController = controllers.paymentController;
export const orderController = controllers.orderController;
export const transactionController = controllers.transactionController;
export const webhookController = controllers.webhookController;
