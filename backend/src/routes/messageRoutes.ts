import { Router } from 'express';
import {
  sendMessage,
  getMessages,
  getConversations,
  getUnreadCount,
  recallMessage
} from '../controllers/messageController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/', authMiddleware, sendMessage);
router.post('/:messageId/recall', authMiddleware, recallMessage);
router.get('/conversations', authMiddleware, getConversations);
router.get('/unread-count', authMiddleware, getUnreadCount);
router.get('/:otherUserId', authMiddleware, getMessages);

export default router;
