import express, { Request, Response } from 'express';
import router from './routers/router';

const app = express();
const port = 3000;
const fs = require('fs');
const bodyParser = require('body-parser');

app.use(express.static('./src/public'));
app.use(express.urlencoded( {extended : false } ));
app.use(bodyParser.json());
app.use(router)

if (process.env.NODE_ENV !== 'production') {
    app.get('/', async (req: Request, res: Response) => {
        fs.readFile('./src/public/main.html', (err: NodeJS.ErrnoException | null, data: Buffer) => {
            if (err) throw err;

            res.writeHead(200, {
                'Content-Type': 'text/html'
            })
            res.write(data)
            res.end();
        })
    })
}

app.listen(port,()=>{
    if (process.env.NODE_ENV !== 'production'){
        console.log('server running on http://localhost:'+port);
    }
})
