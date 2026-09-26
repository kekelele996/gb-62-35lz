import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/prisma';

// 撤回时限：5 分钟
const RECALL_TIME_LIMIT_MS = 5 * 60 * 1000;

export const sendMessage = async (req: AuthRequest, res: Response) => {
  const { receiverId, content, image } = req.body;
  const senderId = req.userId!;

  if (!content && !image) {
    return res.status(400).json({ error: '消息内容不能为空' });
  }

  try {
    const sentMessage = await prisma.message.create({
      data: {
        senderId,
        receiverId,
        content: content || undefined,
        image: image || undefined
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatar: true
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
            avatar: true
          }
        }
      }
    });

    res.status(201).json({ message: '发送成功', data: sentMessage });
  } catch (error) {
    res.status(500).json({ error: '发送失败' });
  }
};

export const recallMessage = async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const currentUserId = req.userId!;

  try {
    const message = await prisma.message.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      return res.status(404).json({ error: '消息不存在' });
    }

    if (message.senderId !== currentUserId) {
      return res.status(403).json({ error: '只能撤回自己发送的消息' });
    }

    if (message.isRecalled) {
      return res.status(400).json({ error: '消息已撤回' });
    }

    if (Date.now() - message.createdAt.getTime() > RECALL_TIME_LIMIT_MS) {
      return res.status(403).json({ error: '消息发送超过五分钟，无法撤回' });
    }

    const recalledMessage = await prisma.message.update({
      where: { id: messageId },
      data: {
        isRecalled: true,
        recalledAt: new Date(),
        content: null,
        image: null,
        // 撤回的消息不再计入未读
        isRead: true
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatar: true
          }
        }
      }
    });

    res.json({ message: '撤回成功', data: recalledMessage });
  } catch (error) {
    res.status(500).json({ error: '撤回失败' });
  }
};

export const getMessages = async (req: AuthRequest, res: Response) => {
  const { otherUserId } = req.params;
  const currentUserId = req.userId!;
  const { page = 1, limit = 50 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  try {
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: currentUserId }
        ]
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatar: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit)
    });

    await prisma.message.updateMany({
      where: {
        senderId: otherUserId,
        receiverId: currentUserId,
        isRead: false,
        isRecalled: false
      },
      data: { isRead: true }
    });

    res.json({
      messages: messages.reverse(),
      pagination: {
        page: Number(page),
        limit: Number(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: '获取失败' });
  }
};

export const getConversations = async (req: AuthRequest, res: Response) => {
  const currentUserId = req.userId!;

  try {
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: currentUserId },
          { receiverId: currentUserId }
        ]
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatar: true
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
            avatar: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const conversations = new Map<string, any>();

    messages.forEach(msg => {
      const otherUserId = msg.senderId === currentUserId ? msg.receiverId : msg.senderId;
      const otherUser = msg.senderId === currentUserId ? msg.receiver : msg.sender;

      if (!conversations.has(otherUserId)) {
        conversations.set(otherUserId, {
          userId: otherUserId,
          user: otherUser,
          lastMessage: msg,
          unreadCount: 0
        });
      }

      const conversation = conversations.get(otherUserId);
      if (
        msg.receiverId === currentUserId &&
        !msg.isRead &&
        !msg.isRecalled
      ) {
        conversation.unreadCount++;
      }
    });

    res.json({
      conversations: Array.from(conversations.values())
    });
  } catch (error) {
    res.status(500).json({ error: '获取失败' });
  }
};

export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  const currentUserId = req.userId!;

  try {
    const count = await prisma.message.count({
      where: {
        receiverId: currentUserId,
        isRead: false,
        isRecalled: false
      }
    });

    res.json({ unreadCount: count });
  } catch (error) {
    res.status(500).json({ error: '获取失败' });
  }
};
