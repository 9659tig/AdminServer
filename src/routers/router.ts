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
    clipTaskBodySchema,
    coupangHmacBodySchema,
    influencerBodySchema,
    productImgsQuerySchema,
    productNameBodySchema,
    productSearchQuerySchema,
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

// 클립 생성하기
router.post('/clip', validateBody(clipTaskBodySchema), ClipCtrl.addNewClip)
// 클립 목록 조회
router.get('/clips/:videoId', validateParams(videoIdParamSchema), ClipCtrl.getClipList)

// 클립 영상 상품 이미지들 조회
router.get('/products', validateQuery(productImgsQuerySchema), ProductCtrl.getProductImgs)
// 구글 이미지 서치 정보 가져오기
router.get('/product', validateQuery(productSearchQuerySchema), ProductCtrl.getProductSearchInfo)
// chatGpt 상품명 가져오기
router.post('/productName', validateBody(productNameBodySchema), ProductCtrl.getProductGptInfo)
// hmacgenerator
router.post('/productInfo/coupangHmac', validateBody(coupangHmacBodySchema), ProductCtrl.generateHMAC)
// 상품 정보 저장
router.post('/productInfo', validateBody(addProductBodySchema), ProductCtrl.addNewProduct)
// 상품 존재 여부
router.get('/productInfo/:channelId', validateParams(checkProductExistParamsSchema), validateQuery(checkProductExistQuerySchema), ProductCtrl.checkProductExist)

export default router;
