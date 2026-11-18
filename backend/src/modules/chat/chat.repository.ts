import prisma from '../../infrastructure/prisma/prisma.client';
export const chatRepository = {
  async findConversation(id: string, userId: string) { return prisma.chatConversation.findFirst({ where: { id, userId } }); },
  async getMessages(conversationId: string, limit?: number) {
    const messages = await prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: limit ? 'desc' : 'asc' },
      ...(limit ? { take: limit } : {}),
    });
    return limit ? messages.reverse() : messages;
  },
  async addTurn(
    userId: string,
    conversationId: string | null,
    title: string,
    userContent: string,
    assistantContent: string,
  ) {
    return prisma.$transaction(async (transaction) => {
      const currentConversationId = conversationId
        ? conversationId
        : (
            await transaction.chatConversation.create({
              data: { userId, title },
            })
          ).id;

      if (conversationId) {
        await transaction.chatConversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });
      }

      await transaction.chatMessage.create({
        data: {
          conversationId: currentConversationId,
          role: 'user',
          content: userContent,
        },
      });
      const assistantMessage = await transaction.chatMessage.create({
        data: {
          conversationId: currentConversationId,
          role: 'assistant',
          content: assistantContent,
        },
      });
      return { conversationId: currentConversationId, message: assistantMessage };
    });
  },
  async getUserConversations(userId: string) { return prisma.chatConversation.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, include: { _count: { select: { messages: true } } } }); },
};
