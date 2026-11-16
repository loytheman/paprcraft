import { catchAsync, ApiError, errorType, errorMessage } from "../middlewares/error.js";
import * as accountService from "../services/service.account.js";
import httpStatus from "http-status";

export class AccountController {
  createUserAccount = catchAsync(async (req, res) => {
    const account = await accountService.createUserAccount(req.joiData, req.blameable);
    res.status(httpStatus.CREATED).json(account);
  });

  searchAccounts = catchAsync(async (req, res) => {
    const { q, limit, organizationId } = req.joiData;
    const accounts = await accountService.searchAccounts(q, organizationId, limit);
    res.json(accounts);
  });

  getAllAccounts = catchAsync(async (req, res) => {
    const { prev, next, limit, prevKey, nextKey, organizationId } = req.joiData;
    const accounts = await accountService.getAllAccounts(prev, next, limit, prevKey, nextKey, organizationId);
    res.json(accounts);
  });

  getAccountById = catchAsync(async (req, res) => {
    const { id } = req.joiData;
    const account = await accountService.getAccountById(id);
    res.json(account);
  });

  updateAccount = catchAsync(async (req, res) => {
    const account = await accountService.updateAccount(req.joiData, req.blameable);
    res.json(account);
  });

  resetAccountPassword = catchAsync(async (req, res) => {
    const { id, passwordHash } = req.joiData;
    const account = await accountService.updateAccountPassword(id, passwordHash, req.blameable);
    res.json(account);
  });

  deleteAccountById = catchAsync(async (req, res) => {
    const { id } = req.joiData;
    await accountService.deleteAccount(id, req.blameable);
    res.json({ message: "Account deleted successfully." });
  });

  getAccountByEmail = catchAsync(async (req, res) => {
    const { email } = req.joiData;
    const account = await accountService.getAccountByEmail(email);
    if (!account) throw new ApiError(httpStatus.NOT_FOUND, errorType.NOT_FOUND, errorMessage.ITEM_NOT_FOUND);
    const { passwordHash, ...safe } = account; // never sent, even to staff
    res.json(safe);
  });
}
