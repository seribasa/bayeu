import { Context } from "hono";
import { IAuthService } from "../../domain/services/interfaces.ts";
import { GetTransactionUseCase } from "../../use_cases/GetTransactionUseCase.ts";

export class TransactionController {
  constructor(
    private authService: IAuthService,
    private getTransactionUseCase: GetTransactionUseCase,
  ) {}

  handleTransaction = async (c: Context) => {
    const txId = c.req.param("transaction_id");

    const authorization = c.req.header("Authorization");
    if (!authorization) {
      return c.json({ is_successful: false, message: "Unauthorized" }, 401);
    }

    const user = await this.authService.verifyUser(authorization);
    if (!user) {
      return c.json({ is_successful: false, message: "Unauthorized" }, 401);
    }

    const result = await this.getTransactionUseCase.execute(txId, user.userId);
    const status = result.status || 200;

    // Remove status before returning
    delete result.status;

    return c.json(
      result,
      status as unknown as 200 | 400 | 401 | 403 | 404 | 500,
    );
  };
}
