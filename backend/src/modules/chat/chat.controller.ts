import { Request, Response, NextFunction } from "express";
import { chatService } from "./chat.service";
export const chatController = {
  async sendMessage(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      res.json({
        success: true,
        message: "Chat response generated",
        data: await chatService.sendMessage(
          req.user!.id,
          req.body.conversationId,
          req.body.message,
        ),
      });
    } catch (e) {
      next(e);
    }
  },
  async getMessages(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      res.json({
        success: true,
        data: await chatService.getConversationMessages(
          req.params.conversationId,
          req.user!.id,
        ),
      });
    } catch (e) {
      next(e);
    }
  },
  async getConversations(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      res.json({
        success: true,
        data: await chatService.getUserConversations(req.user!.id),
      });
    } catch (e) {
      next(e);
    }
  },
};
