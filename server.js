const express = require('express');
const app = express();
const port = 3004;
const fs = require('fs');

app.use(express.static('public'));
app.use(express.urlencoded( {extended : false } ));

const influencersRouter = require('./routers/influencers');
app.use('/influencers', influencersRouter);

app.get('/', async(req,res)=>{
    fs.readFile('./public/main.html', (err,data)=>{
        if(err) throw err;

        res.writeHead(200,{
            'Content-Type' : 'text/html'
        })
        res.write(data)
        res.end();
    })
})

app.listen(port,()=>{
    console.log('server running on http://localhost:'+port);
})