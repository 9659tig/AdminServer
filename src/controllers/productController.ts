import { Request, Response } from 'express';
import { addProduct, getProductInfo } from '../service/products';

function isErrorWithCode(err: unknown): err is { code: string } {
    return !!err && typeof err === 'object' && 'code' in err;
}

export const addNewProduct = async (req: Request, res: Response) => {
    const { clipLink, productLink, productDeepLink, productImages, productName, productBrand, productPrice, category, videoId, categoryUpdate, channelId, meta } = req.validated.body as {
        clipLink: string;
        productLink: string;
        productDeepLink: string;
        productImages: string;
        productName: string;
        productBrand: string;
        productPrice: number;
        category: string;
        videoId: string;
        categoryUpdate: boolean;
        channelId: string;
        meta: string;
    };
    try {
        await addProduct(clipLink, productLink, productDeepLink, productImages, productName, productBrand, productPrice.toString(), category, videoId, categoryUpdate, channelId, meta);
        res.send({ success: true });
    } catch (err) {
        if (!isErrorWithCode(err)) {
            req.log.error({
                event: 'add_product_failed_unexpected',
                err,
            }, 'add_product_failed_unexpected');
            return res.status(500).send({ error: 'Unexpected error', message: 'An unexpected error occurred.' });
        }

        if (err.code === 'ValidationException') {
            return res.status(400).send({ error: 'DB에러', message: 'DynamoDB 요청이 잘못되었습니다.' });
        } else if (err.code === 'ResourceNotFoundException') {
            return res.status(404).send({ error: 'DB에러', message: '테이블이 존재하지 않습니다.' });
        } else {
            req.log.error({
                event: 'add_product_failed',
                err,
                channelId,
                videoId,
            }, 'add_product_failed');
            return res.status(500).send({ error: 'DB에러', message: 'DynamoDB에 데이터 저장 중 오류가 발생했습니다.' });
        }
    }
};

export const checkProductExist = async (req: Request, res: Response) => {
    const { productLink } = req.validated.query as { productLink: string };
    const { channelId: channelID } = req.validated.params as { channelId: string };
    try {
        const products = await getProductInfo(encodeURI(productLink));
        if (!products?.length) return res.send({ exist: false });
        const matchedProduct = products.find(product => product.channelId.S === channelID);
        if (matchedProduct) return res.send({ exist: true, productImages: products[0].productImages, productDeepLink: matchedProduct.productDeepLink.S });
        else return res.send({ exist: true, productImages: products[0].productImages, productDeepLink: '' });
    } catch (err) {
        req.log.error({
            event: 'product_exist_check_failed',
            err,
            channelID,
            productLink,
        }, 'product_exist_check_failed');
        return res.status(404).send({ error: 'DB에러', message: '상품 정보를 가져오지 못했습니다.' });
    }
};
