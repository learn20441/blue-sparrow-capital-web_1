const express = require('express');
const path = require('path');
const app = express();

app.use((req,res,next)=>{ console.log('[req]', req.method, req.url); next(); });

app.use(express.static(__dirname));
app.get('/__probe', (req,res)=>res.send('OK v3'));
app.get(['/mutual-funds','/mutual-funds.html'], (req,res)=>{
  res.sendFile(path.join(__dirname, 'mutual-funds.html'));
});
app.get('/', (req,res)=>res.sendFile(path.join(__dirname, 'index.html')));

const PORT = 3100; // note: 3100
app.listen(PORT, ()=>console.log('TINY server on :'+PORT,'root=',__dirname));
