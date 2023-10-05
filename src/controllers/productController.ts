import { Request, Response } from 'express'
import { listImageFilesInBucket } from '../utils/getS3Images'
import chromium from 'chrome-aws-lambda';

export const getProductImgs = async(req: Request, res: Response) =>{
    const {channelID, videoID, createDate} = req.query
    if(!channelID)
        return res.status(400).send({ error: '입력 형식 에러', message: 'channel Id값이 없습니다.' });
    if (typeof channelID !== 'string')
        return res.status(400).send({ error: '입력 형식 에러', message: 'channel Id값이 잘못되었습니다.' });

    if(!videoID)
        return res.status(400).send({ error: '입력 형식 에러', message: 'video Id값이 없습니다.' });
    if (typeof videoID !== 'string')
        return res.status(400).send({ error: '입력 형식 에러', message: 'video Id값이 잘못되었습니다.' });

    if(!createDate)
        return res.status(400).send({ error: '입력 형식 에러', message: 'create Date값이 없습니다.' });
    if (typeof createDate !== 'string')
        return res.status(400).send({ error: '입력 형식 에러', message: 'create Date값이 잘못되었습니다.' });

    try{
        const images = await listImageFilesInBucket(channelID+'/'+videoID+'/'+createDate)
        return res.send(images)
    }catch(err){
        console.log(err);
        return res.status(404).send({ error: 'S3에러', message: '상품 이미지를 가져오지 못했습니다.' });
    }
}

export const getProductSearchInfo = async(req: Request, res: Response) => {
    try {
        const fileUrl: string = decodeURIComponent(req.query.link as string);
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
                console.log(col,row,product.text,product.imgsource,product.url);
            }
        }
        await browser.close();
        res.json(products);

    } catch(err){
        console.error("An error occurred while scraping the webpage:", err);
        return res.status(500).send({ error:'크롤링 에러', message:'웹 페이지 스크래핑 중 오류가 발생했습니다.' });
    }
}