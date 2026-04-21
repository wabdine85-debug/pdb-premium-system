import express from 'express';
import { getMe, getAllowed } from '../controllers/member.controller.js';

const router = express.Router();

router.get('/me', getMe);
router.get('/allowed', getAllowed);

export default router;