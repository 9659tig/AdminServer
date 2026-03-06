import { Request, Response } from 'express'
import { listImageFilesInBucket } from '../utils/getS3Images'
import chromium from 'chrome-aws-lambda';
import chatGPT from '../config/chatGpt';
import { generateHmac } from '../utils/generateHmac';
import { addProduct, getProductInfo } from '../service/products';

export const getProductImgs = async(req: Request, res: Response) =>{
    const {channelID, videoID, createDate} = req.validated.query as { channelID: string; videoID: string; createDate: string };

    try{
        const images = await listImageFilesInBucket(channelID+'/'+videoID+'/'+createDate);
        return res.send(images);
    }catch(err){
        req.log.error({
            event: 'product_images_failed',
            err,
            channelID,
            videoID,
            createDate,
        }, 'product_images_failed');
        return res.status(404).send({ error: 'S3에러', message: '상품 이미지를 가져오지 못했습니다.' });
    }
}

export const getProductSearchInfo = async(req: Request, res: Response) => {
    try {
        const { link: fileUrl } = req.validated.query as { link: string };
        const link: string ='https://lens.google.com/uploadbyurl?url='+fileUrl+'&hl=ko-KR';

        let products: Array<{text:string,imgsource:string,url:string}> = [];

        const browser = await chromium.puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });
        let page = await browser.newPage();
        await page.goto(link);
        console.log('page loading . . .');

        await page.waitForNavigation();
        await page.waitForSelector('.aah4tc');
        console.log('page loaded!');

        const columns:number = await page.evaluate(() => {
            const container:any=document.querySelector('.aah4tc');
            return container.children.length;
        });
        for(let i=0; i<5; i++){
            let col=i%columns;
            let row=Math.floor(i/columns);
            // 존재하는 상품에 대해서만 접근
            const productExists:boolean=await page.evaluate((indices)=>{
                const [col,row]=indices;
                const container:any=document.querySelector('.aah4tc');
                return container.children[col] &&
                        container.children[col].children[row] &&
                        container.children[col].children[row].children[0] &&
                        container.children[col].children[row].children[0].children[0];
            }, [col,row]);
            if(productExists){
                const product:{text:string,imgsource:string,url:string}=await page.evaluate((indices)=>{
                    const [col,row]=indices;
                    const a:any=document.querySelector(`.aah4tc`)!.children[col].children[row].children[0].children[0];
                    return {text:a.textContent,imgsource:a.src,url:a.href};
                }, [col,row]);
                products.push(product);
                //console.log(col,row,product.text,product.imgsource,product.url);
            }
        }
        await browser.close();
        res.json(products);

    } catch(err){
        req.log.error({
            event: 'product_search_failed',
            err,
        }, 'product_search_failed');
        return res.status(500).send({ error:'크롤링 에러', message:'웹 페이지 스크래핑 중 오류가 발생했습니다.' });
    }
}

export const getProductGptInfo = async(req: Request, res: Response) => {
    try{
        const { candidates } = req.validated.body as { candidates: string[] };
        const text = candidates.map((candidate, index) => `${index + 1}.${candidate}`).join(', ');
        const response = await chatGPT(text+'\n 이 정보들로부터 하나의 상품명을 추출해줘. 2가지 이상의 상품이 존재할 경우 먼저 언급된 상품, 더 자주 언급된 상품으로 추출해줘.');
        res.send(response);
    }catch(err){
        req.log.error({
            event: 'product_name_generation_failed',
            err,
        }, 'product_name_generation_failed');
        return res.status(500).send({ error:'gpt 에러', message:'gpt로 정보를 불러오는 도중 오류가 발생했습니다.' });
    }
}

export const generateHMAC = async(req: Request, res: Response)=>{
    const {method, url} = req.validated.body as { method: string; url: string };
    try{
        const HMAC = await generateHmac(method, url);
        res.send(HMAC);
    }catch(err){
        req.log.error({
            event: 'coupang_hmac_failed',
            err,
        }, 'coupang_hmac_failed');
        return res.status(500).send({ error:'HMAC 생성 에러', message:'HMAC를 생성하는 도중 오류가 발생했습니다.' });
    }
}

export const getProduct = async (req: Request, res: Response)=>{
    const {cahnnelId, productLink} = req.body;
    if(!cahnnelId)
        return res.status(400).send({ error: '입력 형식 에러', message: 'channel Id값이 없습니다.' });

    if(!productLink)
        return res.status(400).send({ error: '입력 형식 에러', message: 'productLink값이 없습니다.' });

}

function isErrorWithCode(err: unknown): err is { code: string } {
    return !!err && typeof err === 'object' && 'code' in err;
}

export const addNewProduct = async(req: Request, res: Response)=>{
    const {clipLink, productLink, productDeepLink, productImages, productName, productBrand, productPrice, category, videoId, categoryUpdate, channelId, meta} = req.validated.body as {
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
    try{
        await addProduct(clipLink, productLink, productDeepLink, productImages, productName, productBrand, productPrice.toString(), category, videoId, categoryUpdate, channelId, meta);
        res.send({ success: true });
    }catch(err){
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
}

export const checkProductExist = async(req: Request, res: Response) =>{
    const { productLink } = req.validated.query as { productLink: string };
    const { channelId: channelID } = req.validated.params as { channelId: string };

    try{
        const products = await getProductInfo(encodeURI(productLink));

        if (!products?.length)
            return res.send({ exist: false });

        const matchedProduct = products.find(product => product.channelId.S === channelID);

        if (matchedProduct)
            return res.send({ exist: true, productImages: products[0].productImages, productDeepLink: matchedProduct.productDeepLink.S});
        else
            return res.send({ exist: true, productImages: products[0].productImages, productDeepLink: ""});

    }catch(err){
        req.log.error({
            event: 'product_exist_check_failed',
            err,
            channelID,
            productLink,
        }, 'product_exist_check_failed');
        return res.status(404).send({ error: 'DB에러', message: '상품 정보를 가져오지 못했습니다.' });
    }
}
