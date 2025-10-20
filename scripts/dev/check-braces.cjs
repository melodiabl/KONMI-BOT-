const fs = require('fs');
const path = 'backend/full/whatsapp.js';
const src = fs.readFileSync(path,'utf8');
let line=1, col=0;
let depth=0;
let inStr=null, esc=false, inSL=false, inML=false;
const lines=[];
for (let i=0;i<src.length;i++){
  const ch=src[i], nx=src[i+1];
  col++;
  if (inSL){ if(ch==='\n'){ inSL=false; lines.push({line,depth}); line++; col=0; } continue; }
  if (inML){ if(ch==='*' && nx=== '/') { inML=false; i++; col++; } if(ch==='\n'){ lines.push({line,depth}); line++; col=0; } continue; }
  if (inStr){
    if(esc){ esc=false; }
    else if(ch==='\\'){ esc=true; }
    else if(ch===inStr){ inStr=null; }
    else if(inStr==='`' && ch==='\n'){ lines.push({line,depth}); line++; col=0; }
    continue;
  }
  if(ch==='/' && nx==='/' ){ inSL=true; i++; col++; continue; }
  if(ch==='/' && nx==='*' ){ inML=true; i++; col++; continue; }
  if(ch==='"' || ch==="'" || ch==='`'){ inStr=ch; continue; }
  if(ch==='{' ){ depth++; }
  if(ch==='}' ){ depth--; }
  if(ch==='\n'){ lines.push({line,depth}); line++; col=0; }
}
console.log('Total lines', line);
function showAround(target){
  for (let l=target-8; l<=target+8; l++){
    const rec = lines.find(x=>x.line===l);
    if(rec) console.log(l, 'depth=', rec.depth);
  }
}
showAround(5527);
