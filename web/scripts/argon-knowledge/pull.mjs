import fs from "fs"
const env = Object.fromEntries(fs.readFileSync("D:/gohub/web/.env.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,"")]}))
const U=env.NEXT_PUBLIC_SUPABASE_URL,K=env.SUPABASE_SECRET_KEY
const out=process.argv[2]
for (const t of ["creator_kb","kb_wiki_pages"]) {
  let all=[],from=0
  for(;;){const r=await fetch(`${U}/rest/v1/${t}?select=*&order=id.asc`,{headers:{apikey:K,Authorization:"Bearer "+K,Range:`${from}-${from+999}`}});const j=await r.json();if(!Array.isArray(j)){console.log(t,JSON.stringify(j).slice(0,200));break}all=all.concat(j);if(j.length<1000)break;from+=1000}
  fs.writeFileSync(`${out}/${t}.json`,JSON.stringify(all))
  const cols=Object.keys(all[0]||{})
  const cats={};all.forEach(r=>{const c=r.category||r.group_scope||r.scope||"-";cats[c]=(cats[c]||0)+1})
  console.log(t,all.length,"cols:",cols.join(","),"chars:",all.reduce((n,r)=>n+(r.content||"").length,0),JSON.stringify(cats))
}
