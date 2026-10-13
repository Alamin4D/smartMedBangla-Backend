import type { Request, Response } from "express";
import { UserModel } from "../models/user.model.js";
import { authService } from "../services/auth.service.js";
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from "../utils/cookies.js";
import { sendResponse } from "../utils/response.js";

const clientMeta = (req: Request) => ({ userAgent: req.get("user-agent"), ip: req.ip });

/** Accept the refresh token from the httpOnly cookie, or from the body for API clients like Postman. */
const readRefreshToken = (req: Request) =>
  (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? (req.body?.refreshToken as string | undefined);

export const authController = {
  async register(req: Request, res: Response) {
    const { user, tokens } = await authService.register(req.body, clientMeta(req));
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    sendResponse(res, {
      statusCode: 201,
      message: "Account created. We sent a 6-digit code to your email.",
      data: { user, accessToken: tokens.accessToken },
    });
  },

  async login(req: Request, res: Response) {
    const { user, tokens } = await authService.login(req.body, clientMeta(req));
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    sendResponse(res, { message: "Logged in successfully", data: { user, accessToken: tokens.accessToken } });
  },

  async refresh(req: Request, res: Response) {
    try {
      const tokens = await authService.refresh(readRefreshToken(req));
      setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
      sendResponse(res, { message: "Token refreshed", data: { accessToken: tokens.accessToken } });
    } catch (err) {
      clearAuthCookies(res);
      throw err;
    }
  },

  async logout(req: Request, res: Response) {
    await authService.logoutByRefreshToken(readRefreshToken(req));
    clearAuthCookies(res);
    sendResponse(res, { message: "Logged out" });
  },

  async me(req: Request, res: Response) {
    sendResponse(res, { data: await UserModel.findById(req.user!.id) });
  },

  async verifyEmail(req: Request, res: Response) {
    const user = await authService.verifyEmail(req.body.email, req.body.code);
    sendResponse(res, { message: "Email verified successfully", data: user });
  },

  async resendOtp(req: Request, res: Response) {
    await authService.resendOtp(req.body.email, req.body.purpose);
    sendResponse(res, { message: "If the account exists, a new code has been sent." });
  },

  async forgotPassword(req: Request, res: Response) {
    await authService.forgotPassword(req.body.email);
    sendResponse(res, { message: "If an account exists for this email, a reset code has been sent." });
  },

  async resetPassword(req: Request, res: Response) {
    await authService.resetPassword(req.body.email, req.body.code, req.body.password);
    clearAuthCookies(res);
    sendResponse(res, { message: "Password updated. Please log in with your new password." });
  },

  async changePassword(req: Request, res: Response) {
    await authService.changePassword(req.user!.id, req.user!.sessionId, req.body.currentPassword, req.body.newPassword);
    sendResponse(res, { message: "Password changed. Other devices have been logged out." });
  },

  async sessions(req: Request, res: Response) {
    const sessions = await authService.listSessions(req.user!.id);
    sendResponse(res, { data: sessions.map((s) => ({ ...s, current: s.id === req.user!.sessionId })) });
  },

  async revokeSession(req: Request, res: Response) {
    await authService.revokeSession(req.user!.id, req.params.id as string);
    if (req.params.id === req.user!.sessionId) clearAuthCookies(res);
    sendResponse(res, { message: "Session revoked" });
  },

  async revokeOtherSessions(req: Request, res: Response) {
    const { count } = await authService.revokeOtherSessions(req.user!.id, req.user!.sessionId);
    sendResponse(res, { message: `Logged out from ${count} other device(s)` });
  },
};
