import express, { Request, Response } from 'express';
import path from 'path';
import router from './routers/router';
import agentRouter from './routers/agentRouter';
import { requestContextMiddleware } from './middleware/requestContext';
import { validateEnv } from './config/env';
import { logger } from './config/logger';

const fs = require('fs');

export function createApp() {
    validateEnv();

    const app = express();
    const publicDir = path.resolve(__dirname, '../src/public');

    app.use(requestContextMiddleware);
    app.use(express.static(publicDir));
    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());

    app.get('/health', (req: Request, res: Response) => {
        req.log.info({ event: 'health_check' }, 'health_check');
        return res.status(200).json({ status: 'ok' });
    });

    app.use(router);
    app.use('/agent', agentRouter);

    if (process.env.NODE_ENV !== 'production') {
        app.get('/', async (req: Request, res: Response) => {
            fs.readFile(path.join(publicDir, 'main.html'), (err: NodeJS.ErrnoException | null, data: Buffer) => {
                if (err) {
                    req.log.error({ event: 'root_page_read_failed', err }, 'root_page_read_failed');
                    return res.status(500).send('main.html load failed');
                }

                res.writeHead(200, {
                    'Content-Type': 'text/html'
                });
                res.write(data);
                res.end();
            });
        });
    }

    return app;
}

export function startServer(port = validateEnv().PORT) {
    const app = createApp();
    return app.listen(port, () => {
        logger.info({
            event: 'server_started',
            port,
            nodeEnv: process.env.NODE_ENV ?? 'development',
        }, 'server_started');
    });
}

if (require.main === module) {
    startServer();
}
