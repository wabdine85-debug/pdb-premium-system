import express from 'express';
import { getMe, getAllowed } from '../controllers/member.controller.js';
import { requireShopifyCustomer, verifyShopifyAppProxy } from '../middleware/shopifyAppProxy.js';

const router = express.Router();

router.get('/me', verifyShopifyAppProxy, requireShopifyCustomer, getMe);
router.get('/allowed', verifyShopifyAppProxy, requireShopifyCustomer, getAllowed);

export default router;
