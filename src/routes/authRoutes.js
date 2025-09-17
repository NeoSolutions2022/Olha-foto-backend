import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { register, login, refresh, logout, profile } from '../controllers/authController.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/profile', authenticate, profile);

export default router;
