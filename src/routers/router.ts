import express, { Router } from 'express';
const router: Router = express.Router();
import * as VideoCtrl from '../controllers/videoController'
import * as InfluencerCtrl from '../controllers/influencerController'
import * as ClipCtrl from '../controllers/clipController'
import * as ProductCtrl from '../controllers/productController'
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import {
    addProductBodySchema,
    channelIdParamSchema,
    checkProductExistParamsSchema,
    checkProductExistQuerySchema,
    influencerBodySchema,
    videoIdParamSchema,
    videoLinkQuerySchema,
} from '../validation/schemas';

// 동영상 링크 정보 가져오기 (auto 버튼)
router.get('/videoLink', validateQuery(videoLinkQuerySchema), VideoCtrl.getVideoInfo)
// 비디오 목록 가져오기
router.get('/videos/:channelId', validateParams(channelIdParamSchema), VideoCtrl.getVideoList)

// 채널 정보 가져오기 (+버튼)
router.get('/channel/:channelId', validateParams(channelIdParamSchema), InfluencerCtrl.getChannelInfo)
// 인플루언서 정보 저장
router.post('/influencer', validateBody(influencerBodySchema), InfluencerCtrl.addInfluencerInfo)

// 클립 목록 조회
router.get('/clips/:videoId', validateParams(videoIdParamSchema), ClipCtrl.getClipList)

// 상품 정보 저장
router.post('/productInfo', validateBody(addProductBodySchema), ProductCtrl.addNewProduct)
// 상품 존재 여부
router.get('/productInfo/:channelId', validateParams(checkProductExistParamsSchema), validateQuery(checkProductExistQuerySchema), ProductCtrl.checkProductExist)

export default router;
