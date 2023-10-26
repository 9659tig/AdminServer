const crypto = require('crypto');
import moment from 'moment-timezone';
import { COUPANG_ACCESS } from '../config/secret'

async function generateHmac (method: string, url: string) {
    const parts = url.split(/\?/);
    const [path, query = ''] = parts;
    const datetime = moment.utc().format('YYMMDD[T]HHmmss[Z]');
    const message = datetime + method + path + query;
    const signature = crypto.createHmac('sha256', COUPANG_ACCESS.SECRET_KEY)
        .update(message)
        .digest('hex');
    return `CEA algorithm=HmacSHA256, access-key=${COUPANG_ACCESS.KEY}, signed-date=${datetime}, signature=${signature}`;
}

export {
    generateHmac
};