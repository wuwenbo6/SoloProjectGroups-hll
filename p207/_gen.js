const fs=require('fs'),p=require('path'),B='/Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p207';
const W=(r,c)=>{const f=p.join(B,r);fs.mkdirSync(p.dirname(f),{recursive:true});fs.writeFileSync(f,c);console.log(r,fs.statSync(f).size)};
