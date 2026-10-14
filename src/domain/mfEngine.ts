// @ts-nocheck
import { buildStructured } from './structures.ts'
import { coordinateCell, coordinateRows } from './geo.ts'
import { colorCell, colorValue, descriptionValue, measureCell, measureValue, skuValue } from './values.ts'
// Regras de geração do MassForge, com data de referência injetada pelo job.
let TODAY = new Date();
export function setReferenceDate(date) {
  TODAY = new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
export function getReferenceDate() { return new Date(TODAY.getTime()); }

const TONE={ok:['#E6F2EC','#2F6B4F'],bad:['#F9E3E3','#9A3B3B'],warn:['#F8EDD9','#87601F'],neu:['#F2EDEF','#6B5E66']};
const EXP={ok:'dentro da regra',bad:'fora da regra',warn:'no limite / verificar',neu:'informativo'};
function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const pick=(r,a)=>a[Math.floor(r()*a.length)],int=(r,a,b)=>a+Math.floor(r()*(b-a+1)),digs=(r,n)=>Array.from({length:n},()=>Math.floor(r()*10)),p2=n=>String(n).padStart(2,'0');
function referenceLabel(){const d=TODAY;return p2(d.getDate())+'/'+p2(d.getMonth()+1)+'/'+d.getFullYear()}
const slug=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const key=s=>slug(s).replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const hex=(r,n)=>Array.from({length:n},()=>Math.floor(r()*16).toString(16)).join('');
const uuid=r=>`${hex(r,8)}-${hex(r,4)}-4${hex(r,3)}-${pick(r,['8','9','a','b'])}${hex(r,3)}-${hex(r,12)}`;
const FN=['Ana','Beatriz','Camila','Fernanda','Juliana','Larissa','Mariana','Patrícia','Renata','Sofia'],MN=['Bruno','Carlos','Diego','Eduardo','Felipe','Gustavo','Lucas','Rafael','Thiago','Vinícius'],LN=['Silva','Santos','Oliveira','Souza','Lima','Pereira','Costa','Almeida','Ferreira','Rodrigues','Carvalho','Gomes'];
const FNF=['Emma','Lucia','Marie','Anna','Elena','Nora'],MNF=['Luca','Mateo','Hugo','Leo','Noah','Omar'],LNF=['Rossi','García','Martin','Dubois','Schmidt','Nowak','Kim','Fernández'];
const ABROAD=[
  {pais:'Portugal',nac:'Portuguesa',code:'PT',dd:'+351',cities:['Lisboa','Porto','Coimbra'],streets:['Rua Augusta','Rua Garrett','Avenida da Liberdade']},
  {pais:'Argentina',nac:'Argentina',code:'AR',dd:'+54',cities:['Buenos Aires','Córdoba','Rosario'],streets:['Avenida Corrientes','Calle Florida','Avenida Santa Fe']},
  {pais:'Estados Unidos',nac:'Norte-americana',code:'US',dd:'+1',cities:['Nova York','Chicago','Austin'],streets:['Broadway','Main Street','Oak Avenue']},
  {pais:'Japão',nac:'Japonesa',code:'JP',dd:'+81',cities:['Tóquio','Osaka','Quioto'],streets:['Chuo-dori','Shijo-dori','Sakura-dori']},
  {pais:'Alemanha',nac:'Alemã',code:'DE',dd:'+49',cities:['Berlim','Munique','Hamburgo'],streets:['Hauptstraße','Berliner Allee','Gartenweg']},
  {pais:'França',nac:'Francesa',code:'FR',dd:'+33',cities:['Paris','Lyon','Marselha'],streets:['Rue de Rivoli','Avenue Victor Hugo','Rue Saint-Honoré']},
];
const FNA=['Conceição','Inês','Ângela','Lúcia','Márcia'],MNA=['João','Luís','Sebastião','Antônio','Estêvão'],LNA=['Gonçalves','Simões','Magalhães','Brandão','Assunção'];
const UF6=['SP','RJ','MG','RS','PR','BA'],UFS=['Qualquer'].concat(UF6);
const CITY={SP:['São Paulo','Campinas','Santos'],RJ:['Rio de Janeiro','Niterói','Petrópolis'],MG:['Belo Horizonte','Uberlândia','Juiz de Fora'],RS:['Porto Alegre','Caxias do Sul','Pelotas'],PR:['Curitiba','Londrina','Maringá'],BA:['Salvador','Feira de Santana','Ilhéus']};
const DDD={SP:'11',RJ:'21',MG:'31',RS:'51',PR:'41',BA:'71'};
const CEPR={SP:[1000,19999],RJ:[20000,28999],MG:[30000,39999],BA:[40000,48999],PR:[80000,87999],RS:[90000,99999]};
const STREETS=['Rua das Flores','Av. Brasil','Rua XV de Novembro','Rua Sete de Setembro','Rua da Paz','Av. Independência'],BAIRROS=['Centro','Jardim América','Vila Nova','Boa Vista','Santa Cecília','Liberdade'];
const ufOf=(r,u)=>u&&u!=='Qualquer'?u:pick(r,UF6);
const cepFor=(r,uf)=>{const[a,b]=CEPR[uf];return String(int(r,a,b)).padStart(5,'0')+'-'+digs(r,3).join('')};
function person(r,o={}){const fem=o.genero==='Feminino'?true:o.genero==='Masculino'?false:r()<.5;const first=pick(r,fem?FN:MN),mid=pick(r,LN),last=pick(r,LN);const uf=ufOf(r,o.uf);return{first,last,nome:`${first} ${mid} ${last}`,uf,cidade:pick(r,CITY[uf]),bairro:pick(r,BAIRROS),rua:pick(r,STREETS),numero:int(r,10,1990),cep:cepFor(r,uf),email:`${slug(first)}.${slug(last)}${int(r,10,99)}@exemplo.com.br`,tel:`(${DDD[uf]}) 9${digs(r,4).join('')}-${digs(r,4).join('')}`}}
const CPFR={SP:8,RJ:7,MG:6,RS:0,PR:9,BA:5};
const REG={0:'RS',1:'DF, GO, MS, MT, TO',2:'AC, AM, AP, PA, RO, RR',3:'CE, MA, PI',4:'AL, PB, PE, RN',5:'BA, SE',6:'MG',7:'ES, RJ',8:'SP',9:'PR, SC'};
function cpfD(r,uf){const n=digs(r,9);if(CPFR[uf]!==undefined)n[8]=CPFR[uf];const dv=a=>{const s=a.reduce((t,v,i)=>t+v*(a.length+1-i),0);const x=(s*10)%11;return x===10?0:x};n.push(dv(n));n.push(dv(n));return n}
const fmtCpf=(s,m)=>m&&s.length===11?s.replace(/^(.{3})(.{3})(.{3})(.{2})$/,'$1.$2.$3-$4'):s;
const AN='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function cnpjS(r,alfa,filial){let b='';for(let i=0;i<8;i++)b+=alfa?AN[Math.floor(r()*36)]:String(Math.floor(r()*10));if(alfa)b=b.slice(0,2)+pick(r,AN.slice(10).split(''))+b.slice(3);b+=filial?String(int(r,2,99)).padStart(4,'0'):'0001';const w=[6,5,4,3,2,9,8,7,6,5,4,3,2];const dv=s=>{const ww=w.slice(w.length-s.length);const x=s.split('').reduce((t,c,i)=>t+(c.charCodeAt(0)-48)*ww[i],0)%11;return x<2?0:11-x};b+=dv(b);b+=dv(b);return b}
const fmtCnpj=(s,m)=>m&&s.length===14?s.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/,'$1.$2.$3/$4-$5'):s;
const SANDBOX={Visa:'4111111111111111',Mastercard:'5555555555554444',Amex:'378282246310005'};
function cardNum(r,b){const c={Visa:['4',16],Mastercard:[pick(r,['51','52','53','54','55']),16],Elo:[pick(r,['636368','438935','504175']),16],Amex:[pick(r,['34','37']),15],Hipercard:['606282',16]}[b];const d=c[0].split('').map(Number);while(d.length<c[1]-1)d.push(Math.floor(r()*10));let s=0;for(let i=0;i<d.length;i++){let v=d[d.length-1-i];if(i%2===0){v*=2;if(v>9)v-=9}s+=v}d.push((10-s%10)%10);return d.join('')}
const groupCard=(n,b)=>b==='Amex'&&n.length===15?n.replace(/^(.{4})(.{6})(.{5})$/,'$1 $2 $3'):n.replace(/(.{4})(?=.)/g,'$1 ');
const tlv=(id,v)=>id+String(v.length).padStart(2,'0')+v;
function crc16(s){let c=0xFFFF;for(let i=0;i<s.length;i++){c^=s.charCodeAt(i)<<8;for(let j=0;j<8;j++)c=(c&0x8000)?((c<<1)^0x1021)&0xFFFF:(c<<1)&0xFFFF}return c.toString(16).toUpperCase().padStart(4,'0')}
function pixPayload(k,valor,p){let s=tlv('00','01')+tlv('26',tlv('00','br.gov.bcb.pix')+tlv('01',k))+tlv('52','0000')+tlv('53','986');const val=String(valor||'').replace(/\./g,'').replace(',','.').trim();if(val&&!isNaN(+val))s+=tlv('54',(+val).toFixed(2));s+=tlv('58','BR')+tlv('59',slug(p.first+' '+p.last).toUpperCase().slice(0,25))+tlv('60',slug(p.cidade).toUpperCase().slice(0,15))+tlv('62',tlv('05','***'))+'6304';return s+crc16(s)}
function mod10(num){let s=0,m=2;for(let i=num.length-1;i>=0;i--){let n=+num[i]*m;if(n>9)n-=9;s+=n;m=m===2?1:2}const rest=s%10;return rest===0?0:10-rest}
function mod11Boleto(num){let s=0,w=2;for(let i=num.length-1;i>=0;i--){s+=+num[i]*w;w=w===9?2:w+1}const dv=11-(s%11);return dv===0||dv>9?1:dv}
function fatorVenc(date){if(!date)return '0000';const u=Date.UTC(date.getFullYear(),date.getMonth(),date.getDate());const restart=Date.UTC(2025,1,22);if(u<restart){const days=Math.round((u-Date.UTC(1997,9,7))/864e5);return String(Math.max(0,Math.min(9999,days))).padStart(4,'0')}return String(1000+Math.round((u-restart)/864e5)).padStart(4,'0')}
function fmtLinha(d){return `${d.slice(0,5)}.${d.slice(5,10)} ${d.slice(10,15)}.${d.slice(15,21)} ${d.slice(21,26)}.${d.slice(26,32)} ${d.slice(32,33)} ${d.slice(33)}`}
const CEDENTES=['Oficina Exemplo Ltda','Mercado Teste ME','Padaria Fictícia Ltda','Livraria Sandbox Ltda'];
const isLeap=y=>(y%4===0&&y%100!==0)||y%400===0;
const dim=(y,m)=>new Date(y,m,0).getDate();
const fmtYMD=(y,m,d,f)=>f==='AAAA-MM-DD'?`${y}-${p2(m)}-${p2(d)}`:f==='MM/DD/AAAA'?`${p2(m)}/${p2(d)}/${y}`:`${p2(d)}/${p2(m)}/${y}`;
function I(tag,tone,fields,rule){return{tag,tone,rule:rule||key(tag),checks:[[tag,tone]],fields:fields.map(([k,kk,v])=>({k,key:kk,v:String(v)}))}}
const F={seg:(k,label,opts,show,help)=>({k,label,type:'seg',opts,show,help}),sel:(k,label,opts,show,help)=>({k,label,type:'sel',opts,show,help}),num:(k,label,show,help,presets)=>({k,label,type:'num',show,help,presets}),tog:(k,label,show,help,sample)=>({k,label,type:'tog',show,help,sample}),txt:(k,label,show,help)=>({k,label,type:'txt',show,help}),chips:(k,label,opts,show,extra)=>({k,label,type:'chips',opts,show,...extra}),qtd:(show,label)=>({k:'qtd',label:label||'Quantidade',type:'num',presets:[1,5,10,100],show})};
const colorTipo=v=>v.tipo==='Cor';
const measureTipo=v=>v.tipo==='Comprimento'||v.tipo==='Massa'||v.tipo==='Volume';
const classicFmt=v=>['JSON','XML','CSV','YAML','SQL'].includes(v.formato);
const unitsOf=v=>v.tipo==='Massa'?['g','kg']:v.tipo==='Volume'?['ml','L']:['mm','cm','m'];
const fmtNum=(x,tipo,cs,sep)=>{if(tipo==='Monetário')return 'R$ '+Number(x).toLocaleString('pt-BR',{minimumFractionDigits:cs,maximumFractionDigits:cs});let s=Number(x).toFixed(cs);if(sep==='Vírgula')s=s.replace('.',',');return tipo==='Porcentagem'?s+'%':s};

const fmtN=(x,v,cs)=>{const dec=v.tipo==='Monetário'?',':(v.sep==='Ponto'?'.':',');const th=v.milhar?(dec===','?'.':','):'';const neg=x<0&&Math.abs(x)>=Math.pow(10,-cs)/2;let s=Math.abs(x).toFixed(cs);let[ip,fp]=s.split('.');if(th)ip=ip.replace(/\B(?=(\d{3})+(?!\d))/g,th);s=ip+(fp?dec+fp:'');return(neg?'-':'')+(v.tipo==='Monetário'?'R$ ':'')+s+(v.tipo==='Porcentagem'?'%':'')};
function numCtx(v){const cs=['Decimal','Porcentagem','Monetário'].includes(v.tipo)?Math.max(0,parseInt(v.casas)||0):0;const step=Math.pow(10,-cs);const rd=x=>+(+x).toFixed(cs);let mn=Number(v.min)||0,mx=Number(v.max)||0;if(mn>mx)[mn,mx]=[mx,mn];let lo=rd(mn),hi=rd(mx),adj='';
 if(v.sinal==='Positivo'&&lo<step){lo=step;adj='mínimo ajustado para o menor valor positivo'}if(v.sinal==='Negativo'&&hi>-step){hi=-step;adj='máximo ajustado para o maior valor negativo'}
 const fm=x=>fmtN(x,v,cs);const err=lo>hi?`O intervalo ${fm(mn)} a ${fm(mx)} não contém valores ${v.sinal==='Positivo'?'positivos':'negativos'}.`:'';return{cs,step,rd,lo,hi,fm,err,adj}}
const REL_W={in:'dentro',lim:'no limite',out:'fora'},REL_T={in:'ok',lim:'warn',out:'bad'},M_KEY=s=>key(s);
function boundary(C){const{lo,hi,rd,step,fm,cs}=C;const ss=cs?step.toFixed(cs).replace('.',','):'1';const L=[[rd(lo-step),'Mínimo − '+ss,'out',`menor que o mínimo ${fm(lo)}`],[lo,'Mínimo','lim',`igual ao mínimo ${fm(lo)}`],[rd(lo+step),'Mínimo + '+ss,'in','imediatamente acima do mínimo'],[rd(hi-step),'Máximo − '+ss,'in','imediatamente abaixo do máximo'],[hi,'Máximo','lim',`igual ao máximo ${fm(hi)}`],[rd(hi+step),'Máximo + '+ss,'out',`maior que o máximo ${fm(hi)}`]];const seen=new Set();return L.filter(x=>{if(seen.has(x[0]))return false;seen.add(x[0]);return true}).map(([x,label,rel,why])=>({x,label,rel,why}))}
const ENG={
identidade:{kind:'value',pl:['identidade','identidades'],def:{campos:['Nome','Sobrenome','Nascimento','CPF','E-mail','Telefone','CEP','Endereço','Cidade','Estado'],origem:'Brasileira',genero:'Qualquer',nome:'',sobrenome:'',idadeMin:25,idadeMax:45,uf:'Qualquer',cidade:'Qualquer',pais:'Qualquer',mask:true,fmtData:'DD/MM/AAAA',emailNome:true,dominio:'exemplo.com.br',rCpf:'DV válido',rEmail:'Formato válido',rTel:'Completo',rCep:'Comprimento correto',rNasc:'Coerente com a idade',qtd:1},
 fields:[F.chips('campos','Campos da ficha',v=>v.origem==='Estrangeira'?['Nome','Sobrenome','Nascimento','Passaporte','Nacionalidade','E-mail','Telefone','Endereço','Cidade','País']:['Nome','Sobrenome','Nascimento','CPF','E-mail','Telefone','CEP','Endereço','Cidade','Estado']),
  F.seg('origem','Origem',['Brasileira','Estrangeira'],null,'Estrangeira troca o CPF por passaporte e usa telefone e endereço do país de origem.'),F.seg('genero','Gênero do nome',['Qualquer','Feminino','Masculino']),F.txt('nome','Nome (opcional)',null,'Deixe vazio para sortear.'),F.txt('sobrenome','Sobrenome (opcional)'),F.num('idadeMin','Idade mínima',null,null,[18,25,60]),F.num('idadeMax','Idade máxima',null,null,[17,45,100]),F.sel('uf','Estado',UFS,v=>v.origem!=='Estrangeira'),F.sel('cidade','Cidade',v=>['Qualquer'].concat(CITY[v.uf]||[]),v=>v.origem!=='Estrangeira'&&v.uf!=='Qualquer'),F.sel('pais','País de origem',['Qualquer'].concat(ABROAD.map(p=>p.pais)),v=>v.origem==='Estrangeira'),
  F.tog('mask',v=>v.origem==='Estrangeira'?'Formatar telefone':'Formatar com máscara (CPF, CEP, telefone)'),F.seg('fmtData','Formato da data',['DD/MM/AAAA','AAAA-MM-DD']),F.tog('emailNome','E-mail derivado do nome'),F.txt('dominio','Domínio do e-mail'),
  F.seg('rCpf','CPF',['DV válido','DV inválido'],v=>v.origem!=='Estrangeira'),F.seg('rEmail','E-mail',['Formato válido','Formato inválido']),F.seg('rTel','Telefone',['Completo','Incompleto']),F.seg('rCep','CEP',['Comprimento correto','Comprimento incorreto'],v=>v.origem!=='Estrangeira'),F.seg('rNasc','Nascimento',['Coerente com a idade','Data futura']),F.qtd(null,'Quantidade de identidades')],
 note:()=>'Pessoa inteiramente fictícia. O endereço é montado a partir de listas comuns e não corresponde a uma residência real.',
 one:(v,r)=>{const foreign=v.origem==='Estrangeira';const place=foreign?(v.pais&&v.pais!=='Qualquer'?ABROAD.find(p=>p.pais===v.pais)||pick(r,ABROAD):pick(r,ABROAD)):null;
  const fem=v.genero==='Feminino'?true:v.genero==='Masculino'?false:r()<.5;const first=(v.nome||'').trim()||pick(r,foreign?(fem?FNF:MNF):(fem?FN:MN));let s1=pick(r,foreign?LNF:LN),s2=pick(r,foreign?LNF:LN);while(s2===s1)s2=pick(r,foreign?LNF:LN);const last=(v.sobrenome||'').trim()||s1+' '+s2;
  const uf=foreign?'':ufOf(r,v.uf),cidade=foreign?pick(r,place.cities):(CITY[uf].includes(v.cidade)?v.cidade:pick(r,CITY[uf]));let a=parseInt(v.idadeMin),b=parseInt(v.idadeMax);if(isNaN(a))a=18;if(isNaN(b))b=a;if(a>b)[a,b]=[b,a];
  let dt,age=null;if(v.rNasc==='Data futura'){dt=new Date(TODAY);dt.setDate(dt.getDate()+int(r,30,900))}else{age=int(r,a,b);dt=new Date(TODAY);dt.setFullYear(dt.getFullYear()-age);dt.setDate(dt.getDate()-int(r,1,364))}
  const m=v.mask!==false,d=foreign?null:cpfD(r,uf),dvOk=d?d.slice(9).join(''):'';if(d&&v.rCpf==='DV inválido')d[10]=(d[10]+1+int(r,0,7))%10;
  const cl=s=>slug(s).replace(/[^a-z0-9]/g,'');const loc=v.emailNome!==false?cl(first)+'.'+cl(last.split(' ').pop())+int(r,10,99):'usuario'+digs(r,6).join('');const dom=v.dominio||(foreign?'exemplo.com':'exemplo.com.br');const email=v.rEmail==='Formato inválido'?loc+dom:loc+'@'+dom;
  let tel='',telF='';if(foreign){let digits=digs(r,10).join('');if(v.rTel==='Incompleto')digits=digits.slice(0,-2);tel=place.dd+digits;telF=m?place.dd+' '+(digits.match(/.{1,3}/g)||[]).join(' '):tel}
  else{tel=DDD[uf]+'9'+digs(r,8).join('');if(v.rTel==='Incompleto')tel=tel.slice(0,-1);telF=m?`(${tel.slice(0,2)}) ${tel.slice(2,tel.length-4)}-${tel.slice(-4)}`:tel}
  let cep='';if(!foreign){cep=cepFor(r,uf);if(v.rCep==='Comprimento incorreto')cep=cep.slice(0,-1);if(!m)cep=cep.replace('-','')}
  const rua=foreign?'':pick(r,STREETS),num=int(r,10,1990),bairro=foreign?'':pick(r,BAIRROS);const pass=foreign?place.code+digs(r,7).join(''):'';
  const has=k=>(v.campos||[]).includes(k),f=[],ch=[];
  if(has('Nome'))f.push(['Nome','nome',first]);if(has('Sobrenome'))f.push(['Sobrenome','sobrenome',last]);
  if(has('Nacionalidade')&&place)f.push(['Nacionalidade','nacionalidade',place.nac]);
  if(has('Nascimento')){f.push(['Data de nascimento','data_nascimento',fmtYMD(dt.getFullYear(),dt.getMonth()+1,dt.getDate(),v.fmtData)]);f.push(['Idade','idade',age==null?'—':age]);ch.push(age==null?['Nascimento futuro: posterior a '+referenceLabel(),'bad']:[`Idade ${age} coerente com a data`,'ok'])}
  if(!foreign&&has('CPF')){f.push(['CPF','cpf',fmtCpf(d.join(''),m)]);ch.push(v.rCpf==='DV inválido'?[`CPF inválido: DV incorreto (correto seria ${dvOk})`,'bad']:['CPF com DV válido','ok'])}
  if(foreign&&has('Passaporte')){f.push(['Passaporte','passaporte',pass]);ch.push([`Passaporte fictício de ${place.pais}`,'ok'])}
  if(has('E-mail')){f.push(['E-mail','email',email]);ch.push(v.rEmail==='Formato inválido'?['E-mail inválido: sem @','bad']:['E-mail com formato válido','ok'])}
  if(has('Telefone')){f.push(['Telefone','telefone',telF]);ch.push(v.rTel==='Incompleto'?[foreign?`Telefone incompleto: código ${place.dd}`:`Telefone incompleto: ${tel.length} dígitos com DDD`,'bad']:(foreign?[`Telefone com código ${place.dd}`,'ok']:[`DDD ${DDD[uf]} compatível com ${uf}`,'ok']))}
  if(!foreign&&has('CEP')){f.push(['CEP','cep',cep]);ch.push(v.rCep==='Comprimento incorreto'?['CEP com 7 dígitos','bad']:[`CEP na faixa de ${uf}`,'ok'])}
  if(has('Endereço'))f.push(['Endereço','endereco',foreign?`${pick(r,place.streets)}, ${num}`:`${rua}, ${num} – ${bairro}`]);if(has('Cidade'))f.push(['Cidade','cidade',cidade]);if(!foreign&&has('Estado'))f.push(['Estado','uf',uf]);if(foreign&&has('País'))f.push(['País','pais',place.pais]);
  if(!f.length)return I('nenhum campo','warn',[['Resultado','valor','Selecione ao menos um campo']],'sem_campos');
  const bad=ch.some(c=>c[1]==='bad');const it=I(bad?'contém campos fora da regra':'todos os campos válidos',bad?'bad':'ok',f,bad?'identidade_com_invalidos':'identidade_valida');it.checks=ch.concat([['Dados fictícios','neu']]);it.meta={first,last,age,cidade,uf,fem,pais:place?place.pais:'',nac:place?place.nac:''};return it}},
cpf:{kind:'value',pl:['CPF','CPFs'],def:{regra:'DV correto',mask:'Com máscara',uf:'Qualquer',qtd:10},
 fields:[F.seg('regra','Regra a testar',['DV correto','DV incorreto','Comprimento inválido','Caracteres indevidos','Vazio']),F.seg('mask','Formatação',['Com máscara','Sem máscara'],v=>v.regra!=='Vazio'),F.sel('uf','Região fiscal (9º dígito)',UFS,v=>v.regra!=='Vazio'),F.qtd()],
 one:(v,r)=>{const m=v.mask==='Com máscara';if(v.regra==='Vazio')return I('valor vazio','warn',[['CPF','cpf','']],'vazio');const d=cpfD(r,v.uf),dv=d.slice(9).join('');
  if(v.regra==='DV correto')return I('DV válido','ok',[['CPF','cpf',fmtCpf(d.join(''),m)],['Dígitos verificadores','dv',dv],['Região fiscal','regiao_fiscal',REG[d[8]]]],'dv_correto');
  if(v.regra==='DV incorreto'){const w=d.slice();w[10]=(w[10]+1+int(r,0,7))%10;return I('DV incorreto','bad',[['CPF','cpf',fmtCpf(w.join(''),m)],['DV gerado','dv',w.slice(9).join('')],['DV correto seria','dv_esperado',dv]],'dv_incorreto')}
  if(v.regra==='Comprimento inválido'){const n=r()<.5?10:12;const s=(d.join('')+digs(r,1).join('')).slice(0,n);return I(`${n} dígitos`,'bad',[['CPF','cpf',s],['Comprimento','comprimento',n]],'comprimento_invalido')}
  const a=d.join('').split('');const i=int(r,1,9);a[i]=pick(r,['A','x','#','O']);return I('caractere indevido','bad',[['CPF','cpf',fmtCpf(a.join(''),m)],['Posição','posicao',i+1]],'caractere_indevido')}},
cnpj:{kind:'value',pl:['CNPJ','CNPJs'],def:{regra:'DV correto',mask:'Com máscara',filial:'Matriz (0001)',qtd:10},
 fields:[F.seg('regra','Regra a testar',['DV correto','DV incorreto','Alfanumérico','Comprimento inválido','Vazio'],null,v=>v.regra==='Alfanumérico'?'Novo formato com letras nas 12 primeiras posições; DV calculado pelo valor ASCII − 48.':''),F.seg('mask','Formatação',['Com máscara','Sem máscara'],v=>v.regra!=='Vazio'),F.seg('filial','Estabelecimento',['Matriz (0001)','Filial'],v=>v.regra!=='Vazio'),F.qtd()],
 one:(v,r)=>{const m=v.mask==='Com máscara',fil=v.filial==='Filial';if(v.regra==='Vazio')return I('valor vazio','warn',[['CNPJ','cnpj','']],'vazio');
  if(v.regra==='Alfanumérico'){const c=cnpjS(r,true,fil);return I('DV válido · alfanumérico','ok',[['CNPJ','cnpj',fmtCnpj(c,m)],['Formato','formato','alfanumérico'],['DV','dv',c.slice(12)]],'alfanumerico')}
  const c=cnpjS(r,false,fil);if(v.regra==='DV correto')return I('DV válido','ok',[['CNPJ','cnpj',fmtCnpj(c,m)],['DV','dv',c.slice(12)],['Estabelecimento','estabelecimento',c.slice(8,12)]],'dv_correto');
  if(v.regra==='DV incorreto'){const w=c.slice(0,13)+((+c[13]+1+int(r,0,7))%10);return I('DV incorreto','bad',[['CNPJ','cnpj',fmtCnpj(w,m)],['DV gerado','dv',w.slice(12)],['DV correto seria','dv_esperado',c.slice(12)]],'dv_incorreto')}
  return I('13 dígitos','bad',[['CNPJ','cnpj',c.slice(0,13)],['Comprimento','comprimento',13]],'comprimento_invalido')}},
nome:{kind:'value',pl:['nome','nomes'],def:{genero:'Qualquer',partes:'Nome e sobrenome',regra:'Comum',qtd:10},
 fields:[F.seg('regra','Característica',['Comum','Com acentos','Muito longo','Apóstrofo e hífen']),F.seg('partes','Partes',['Só o primeiro','Nome e sobrenome','Completo'],v=>v.regra==='Comum'||v.regra==='Com acentos'),F.seg('genero','Gênero',['Qualquer','Feminino','Masculino']),F.qtd()],
 one:(v,r)=>{const fem=v.genero==='Feminino'?true:v.genero==='Masculino'?false:r()<.5;let n;
  if(v.regra==='Muito longo')n=[pick(r,fem?FN:MN),pick(r,fem?['Aparecida','Cristina','Helena']:['Augusto','Henrique','Eduardo']),'dos',pick(r,LN),pick(r,LN),'de',pick(r,LN),pick(r,LN),pick(r,LN)].join(' ');
  else if(v.regra==='Apóstrofo e hífen')n=pick(r,fem?['Ana-Clara','Maria-Luísa','Anne-Marie']:['Jean-Pierre','João-Pedro','Luiz-Felipe'])+' '+pick(r,["D'Ávila","O'Connor","D'Almeida","Sant'Anna"]);
  else{const acc=v.regra==='Com acentos';const f=pick(r,acc?(fem?FNA:MNA):(fem?FN:MN)),l1=pick(r,acc?LNA:LN),l2=pick(r,acc?LNA:LN);n=v.partes==='Só o primeiro'?f:v.partes==='Nome e sobrenome'?`${f} ${l2}`:`${f} ${l1} ${l2}`}
  const len=Array.from(n).length;return I(`${len} caracteres`,'neu',[['Nome','nome',n],['Comprimento','comprimento',len]],key(v.regra))}},
email:{kind:'value',pl:['e-mail','e-mails'],def:{regra:'Válido',dominio:'exemplo.com.br',qtd:10},
 fields:[F.seg('regra','Regra a testar',['Válido','Sem @','Domínio inválido','Com espaço','Acima de 254 caracteres']),F.txt('dominio','Domínio',null,'Prefira domínios reservados para teste.'),F.qtd()],
 one:(v,r)=>{const p=person(r);const dom=v.dominio||'exemplo.com.br';const loc=`${slug(p.first)}.${slug(p.last)}${int(r,10,99)}`;let e,tag='formato válido',tone='bad';
  if(v.regra==='Válido'){e=`${loc}@${dom}`;tone='ok'}else if(v.regra==='Sem @'){e=loc+dom;tag='sem @'}else if(v.regra==='Domínio inválido'){e=loc+'@'+pick(r,['exemplo','-exemplo.com','exemplo..com.br','exemplo.c']);tag='domínio inválido'}else if(v.regra==='Com espaço'){e=`${slug(p.first)} ${slug(p.last)}@${dom}`;tag='contém espaço'}else{let d=dom;while((loc+'@'+d).length<=255)d='subdominio-'+int(r,10,99)+'.'+d;e=loc+'@'+d;tag=`${e.length} caracteres`}
  return I(tag,tone,[['E-mail','email',e],['Comprimento','comprimento',e.length]],key(v.regra))}},
telefone:{kind:'value',pl:['telefone','telefones'],def:{tipo:'Celular',uf:'SP',formato:'Com máscara',regra:'Válido',qtd:10},
 fields:[F.seg('tipo','Tipo',['Celular','Fixo']),F.sel('uf','Estado (DDD)',UFS),F.seg('formato','Formato',['Com máscara','Só dígitos','E.164 (+55)']),F.seg('regra','Regra a testar',['Válido','DDD inexistente','Dígitos a menos']),F.qtd()],
 one:(v,r)=>{const uf=ufOf(r,v.uf);let ddd=DDD[uf],tag='formato válido',tone='ok';if(v.regra==='DDD inexistente'){ddd=pick(r,['20','23','25','26','29','30','36','39','52','56','57','58','59','72','76','78','80','90']);tag='DDD inexistente';tone='bad'}
  let n=v.tipo==='Celular'?'9'+digs(r,8).join(''):int(r,2,5)+digs(r,7).join('');if(v.regra==='Dígitos a menos'){n=n.slice(0,-1);tag='dígitos a menos';tone='bad'}
  const out=v.formato==='Só dígitos'?ddd+n:v.formato==='E.164 (+55)'?'+55'+ddd+n:`(${ddd}) ${n.slice(0,n.length-4)}-${n.slice(-4)}`;return I(tag,tone,[['Telefone','telefone',out],['DDD','ddd',ddd],['Tipo','tipo',v.tipo]],key(v.regra))}},
cep:{kind:'value',pl:['CEP','CEPs'],def:{uf:'SP',formato:'Com hífen',regra:'Válido para a UF',qtd:10},
 fields:[F.sel('uf','Estado',UFS),F.seg('formato','Formato',['Com hífen','Só dígitos']),F.seg('regra','Regra a testar',['Válido para a UF','Zerado','Dígitos a menos','Com letras']),F.qtd()],
 note:()=>'CEPs gerados dentro da faixa numérica do estado. O logradouro não é verificado nos Correios.',
 one:(v,r)=>{const uf=ufOf(r,v.uf);let c=cepFor(r,uf),tag=`faixa de ${uf}`,tone='ok';if(v.regra==='Zerado'){c='00000-000';tag='CEP zerado';tone='bad'}if(v.regra==='Dígitos a menos'){c=c.slice(0,-1);tag='7 dígitos';tone='bad'}if(v.regra==='Com letras'){c=c.slice(0,3)+'A'+c.slice(4);tag='contém letra';tone='bad'}if(v.formato==='Só dígitos')c=c.replace('-','');return I(tag,tone,[['CEP','cep',c],['UF','uf',uf]],key(v.regra))}},
endereco:{kind:'value',pl:['endereço','endereços'],def:{uf:'Qualquer',compl:true,qtd:10},
 fields:[F.sel('uf','Estado',UFS),F.tog('compl','Incluir complemento'),F.qtd()],
 note:()=>'Endereços fictícios montados a partir de listas de logradouros comuns.',
 one:(v,r)=>{const p=person(r,{uf:v.uf});const comp=v.compl?`Apto ${int(r,11,184)}`:'';const line=`${p.rua}, ${p.numero}${comp?' – '+comp:''}, ${p.bairro}, ${p.cidade} – ${p.uf}, ${p.cep}`;return I('fictício','neu',[['Endereço','endereco',line],['Logradouro','logradouro',p.rua],['Número','numero',p.numero],['Complemento','complemento',comp],['Bairro','bairro',p.bairro],['Cidade','cidade',p.cidade],['UF','uf',p.uf],['CEP','cep',p.cep]],'ficticio')}},
nascimento:{kind:'value',pl:['data de nascimento','datas de nascimento'],def:{faixa:'18 a 60 anos',formato:'DD/MM/AAAA',qtd:10},
 fields:[F.seg('faixa','Faixa',['18 a 60 anos','Menor de idade','Faz 18 anos hoje','Mais de 100 anos','Data futura']),F.seg('formato','Formato',['DD/MM/AAAA','AAAA-MM-DD']),F.qtd()],
 one:(v,r)=>{const sub=(y,dd)=>{const x=new Date(TODAY);x.setFullYear(x.getFullYear()-y);x.setDate(x.getDate()-dd);return x};let d,tone='ok';
  if(v.faixa==='Faz 18 anos hoje')d=sub(18,0);else if(v.faixa==='Data futura'){d=new Date(TODAY);d.setDate(d.getDate()+int(r,1,900));tone='bad'}else{const[a,b]=v.faixa==='Menor de idade'?[0,17]:v.faixa==='Mais de 100 anos'?[101,112]:[18,60];d=sub(int(r,a,b),int(r,1,364))}
  let age=TODAY.getFullYear()-d.getFullYear();if(TODAY<new Date(TODAY.getFullYear(),d.getMonth(),d.getDate()))age--;if(v.faixa==='Menor de idade')tone='warn';
  return I(v.faixa==='Data futura'?'data futura':`${age} anos`,tone,[['Data de nascimento','data_nascimento',fmtYMD(d.getFullYear(),d.getMonth()+1,d.getDate(),v.formato)],['Idade em '+referenceLabel(),'idade',v.faixa==='Data futura'?'—':age]],key(v.faixa))}},
numero:{kind:'value',pl:['número','números'],def:{tipo:'Inteiro',sinal:'Qualquer',min:1,max:100,casas:'2',sep:'Vírgula',milhar:true,regra:'Aleatório no intervalo',ordem:'Crescente',passo:1,unicos:false,qtd:10,repr:'HEX',origemCor:'Aleatória',corBase:'#3d6b34',alfa:100,regraCor:'Válida',unidade:'cm',converter:'Não converter'},
 fields:[F.seg('tipo','Tipo de valor',['Inteiro','Decimal','Porcentagem','Monetário','Sequência','Cor','Comprimento','Massa','Volume']),F.seg('sinal','Sinal',['Qualquer','Positivo','Negativo','Zero'],v=>v.tipo!=='Sequência'&&!colorTipo(v)&&!measureTipo(v),v=>v.sinal==='Zero'?'Gera sempre 0; o intervalo é ignorado.':''),
  F.seg('repr','Representação',['HEX','RGB','RGBA'],v=>colorTipo(v),'HEX, RGB e RGBA saem da mesma cor de base.'),F.seg('origemCor','Origem',['Aleatória','Informada'],v=>colorTipo(v)),F.txt('corBase','Cor de partida',v=>colorTipo(v)&&v.origemCor==='Informada','#RRGGBB, rgb() ou rgba().'),F.num('alfa','Alfa (0 a 100)',v=>colorTipo(v)&&v.repr==='RGBA','0 é transparente e 100 é opaco.',[0,50,100]),F.sel('regraCor','Regra da cor',['Válida','HEX inválido','Canal fora do intervalo'],v=>colorTipo(v)),
  F.sel('unidade','Unidade',unitsOf,v=>measureTipo(v)),F.sel('converter','Converter para',v=>['Não converter',...unitsOf(v)],v=>measureTipo(v),'Mesmo valor físico. O aviso diz se houve arredondamento.'),
  F.num('min','Mínimo',v=>measureTipo(v)||((v.sinal!=='Zero'||v.tipo==='Sequência'||v.tipo==='Todas as variações')&&!colorTipo(v)),v=>v.tipo==='Sequência'||v.tipo==='Todas as variações'?'Valor inicial da sequência, e mínimo dos demais tipos.':''),F.num('max','Máximo',v=>measureTipo(v)||(((v.tipo!=='Sequência'&&v.sinal!=='Zero')||v.tipo==='Todas as variações')&&!colorTipo(v))),F.seg('ordem','Ordem',['Crescente','Decrescente'],v=>v.tipo==='Sequência'||v.tipo==='Todas as variações'),F.num('passo','Passo',v=>v.tipo==='Sequência'||v.tipo==='Todas as variações'),
  F.sel('regra','Regra de geração',['Aleatório no intervalo','Abaixo do mínimo','Acima do máximo','Valores repetidos'],v=>measureTipo(v)||(((v.tipo!=='Sequência'&&v.sinal!=='Zero')||v.tipo==='Todas as variações')&&!colorTipo(v))),F.tog('unicos','Somente valores únicos',v=>!colorTipo(v)&&!measureTipo(v)&&v.tipo!=='Sequência'&&v.sinal!=='Zero'&&(v.regra==='Aleatório no intervalo'||v.regra==='Todas as variações')),
  F.sel('casas','Casas decimais',['0','1','2','3','4'],v=>measureTipo(v)||['Decimal','Porcentagem','Monetário','Todas as variações'].includes(v.tipo)),F.seg('sep','Separador decimal',['Vírgula','Ponto'],v=>measureTipo(v)||v.tipo==='Decimal'||v.tipo==='Porcentagem'||v.tipo==='Todas as variações'),F.tog('milhar','Separador de milhar',v=>!colorTipo(v)&&!measureTipo(v)),F.qtd()],
 run:(v,r)=>{
  if(v.tipo==='Cor') return colorRun(v,r);
  if(measureTipo(v)) return measureRun(v,r);
  const C=numCtx(v),{lo,hi,fm,rd,step,cs}=C;const n=Math.max(1,Math.min(+v.qtd||1,1000));
  const mk=(x,tag,tone,why,rule)=>I(tag,tone,[['Valor','valor',fm(x)],['Valor bruto','valor_bruto',x.toFixed(cs)],['Regra aplicada','regra',why]],rule);
  if(v.tipo==='Sequência'){const p=Math.abs(Number(v.passo))||1,dsc=v.ordem==='Decrescente',s0=Number(v.min)||0;return Array.from({length:n},(_,i)=>{const x=dsc?s0-i*p:s0+i*p;return mk(x,'#'+(i+1),'neu',`sequência ${dsc?'decrescente':'crescente'} a partir de ${fm(s0)}, passo ${p}`,'sequencia')})}
  if(v.sinal==='Zero')return Array.from({length:n},()=>mk(0,'zero','neu','sinal = Zero','zero'));
  if(C.err)return[I('configuração incompatível','warn',[['Resultado','valor','—'],['Motivo','motivo',C.err]],'incompativel')];
  const iv=`${fm(lo)} a ${fm(hi)}`,rand=()=>cs?rd(lo+r()*(hi-lo)):Math.floor(lo+r()*(hi-lo+1)),inn=x=>mk(x,'dentro do intervalo','ok',`${fm(x)} está entre ${iv}`,'dentro_do_intervalo');
  switch(v.regra){
  case'Mínimo exato':return[mk(lo,'no limite · mínimo','warn',`igual ao mínimo ${fm(lo)}`,'minimo_exato')];
  case'Máximo exato':return[mk(hi,'no limite · máximo','warn',`igual ao máximo ${fm(hi)}`,'maximo_exato')];
  case'Abaixo do mínimo':return Array.from({length:n},(_,i)=>{const x=i===0?rd(lo-step):rd(lo-step-r()*Math.max(step*10,(hi-lo)*.2));return mk(x,'fora · abaixo do mínimo','bad',`${fm(x)} é menor que o mínimo ${fm(lo)}`,'abaixo_do_minimo')});
  case'Acima do máximo':return Array.from({length:n},(_,i)=>{const x=i===0?rd(hi+step):rd(hi+step+r()*Math.max(step*10,(hi-lo)*.2));return mk(x,'fora · acima do máximo','bad',`${fm(x)} é maior que o máximo ${fm(hi)}`,'acima_do_maximo')});
  case'Valores de fronteira':return boundary(C).map(b=>mk(b.x,b.label+' · '+REL_W[b.rel],REL_T[b.rel],b.why,M_KEY(b.label)));
  case'Valores repetidos':{const x=rand(),k=Math.max(2,n);return Array.from({length:k},()=>mk(x,'valor repetido','neu',`${fm(x)} repetido ${k} vezes`,'repetido'))}
  default:{if(v.unicos){const total=Math.round((hi-lo)/step)+1,k=Math.min(n,total),set=new Set();let g=0;while(set.size<k&&g++<k*60)set.add(rand());const arr=[...set].map(inn);if(total<n)arr.push(I('limite de valores únicos','warn',[['Resultado','valor','—'],['Motivo','motivo',`O intervalo tem só ${total} valores distintos.`]],'unicos'));return arr}return Array.from({length:n},()=>inn(rand()))}}}},
data:{kind:'value',pl:['data','datas'],def:{tipo:'Data',formato:'DD/MM/AAAA',regra:'Existente',anoMin:1990,anoMax:2030,fuso:'UTC−03:00',qtd:10},
 fields:[F.seg('tipo','Tipo',['Data','Horário','Data e hora','Timestamp Unix','ISO 8601']),F.sel('formato','Formato',['DD/MM/AAAA','AAAA-MM-DD','MM/DD/AAAA'],v=>v.tipo==='Data'||v.tipo==='Data e hora'||v.tipo==='Todas as variações'),F.seg('regra','Regra a testar',['Existente','Passada','Futura','Inexistente','29 de fevereiro','Fora do intervalo']),F.num('anoMin','Ano inicial',v=>v.tipo!=='Horário'),F.num('anoMax','Ano final',v=>v.tipo!=='Horário'),F.sel('fuso','Fuso',['UTC−03:00','UTC','UTC−05:00','UTC+01:00'],v=>v.tipo==='ISO 8601'||v.tipo==='Timestamp Unix'||v.tipo==='Todas as variações'),F.qtd()],
 run:(v,r)=>{let a=parseInt(v.anoMin)||1990,b=parseInt(v.anoMax)||2030;if(a>b)[a,b]=[b,a];const na=(why)=>[I('não se aplica','warn',[['Resultado','valor','—'],['Motivo','motivo',why]],'nao_se_aplica')];
  if(v.regra==='Inexistente'&&v.tipo==='Timestamp Unix')return na('Todo timestamp Unix representa um instante existente. Use Fora do intervalo.');
  if(v.tipo==='Horário'&&!['Existente','Inexistente'].includes(v.regra))return na('Horários não têm data; use Existente ou Inexistente.');
  const leaps=[];for(let y=a;y<=b;y++)if(isLeap(y))leaps.push(y);if(v.regra==='29 de fevereiro'&&!leaps.length)return na(`Nenhum ano bissexto entre ${a} e ${b}.`);
  const off={'UTC−03:00':-3,'UTC':0,'UTC−05:00':-5,'UTC+01:00':1}[v.fuso];const offS=off===0?'Z':(off<0?'-':'+')+p2(Math.abs(off))+':00';
  const n=Math.max(1,Math.min(+v.qtd||1,1000));return Array.from({length:n},()=>{let y,m,d,tag,tone='ok';const h=int(r,0,23),mi=int(r,0,59),se=int(r,0,59);
   if(v.regra==='Inexistente'){if(v.tipo==='Horário'){const t=pick(r,[[24,0,1],[25,30,0],[12,60,0],[8,15,61]]);return I('horário inexistente','bad',[['Horário','valor',`${p2(t[0])}:${p2(t[1])}:${p2(t[2])}`]],'inexistente')}
    const c=pick(r,[[31,4,'abril tem 30 dias'],[31,6,'junho tem 30 dias'],[30,2,'fevereiro não tem dia 30'],[29,2,'ano não bissexto'],[32,1,'dia 32'],[0,8,'dia zero'],[15,13,'mês 13']]);d=c[0];m=c[1];y=int(r,a,b);if(c[2]==='ano não bissexto')while(isLeap(y))y++;tag=c[2];tone='bad'}
   else if(v.regra==='29 de fevereiro'){y=pick(r,leaps);m=2;d=29;tag=`${y} é bissexto`}
   else if(v.regra==='Passada'||v.regra==='Futura'){const dt=new Date(TODAY);dt.setDate(dt.getDate()+(v.regra==='Passada'?-1:1)*int(r,1,3650));y=dt.getFullYear();m=dt.getMonth()+1;d=dt.getDate();tag=v.regra==='Passada'?'anterior a '+referenceLabel():'posterior a '+referenceLabel();tone='neu'}
   else if(v.regra==='Fora do intervalo'){y=r()<.5?a-int(r,1,5):b+int(r,1,5);m=int(r,1,12);d=int(r,1,28);tag=`fora de ${a}–${b}`;tone='bad'}
   else{y=int(r,a,b);m=int(r,1,12);d=int(r,1,dim(y,m));tag='data válida'}
   const t=`${p2(h)}:${p2(mi)}:${p2(se)}`;let out;
   if(v.tipo==='Horário')out=t,tag=tone==='ok'?'horário válido':tag;else if(v.tipo==='Data')out=fmtYMD(y,m,d,v.formato);else if(v.tipo==='Data e hora')out=fmtYMD(y,m,d,v.formato)+' '+t;else if(v.tipo==='Timestamp Unix')out=String(Math.floor(Date.UTC(y,m-1,d,h,mi,se)/1000-off*3600));else out=`${y}-${p2(m)}-${p2(d)}T${t}${offS}`;
   return I(tag,tone,[[v.tipo,'valor',out],['Tipo','tipo',v.tipo]],key(v.regra))})}},
bancario:{kind:'value',pl:['conta bancária','contas bancárias'],def:{banco:'001 · Banco do Brasil',tipo:'Corrente',regra:'DV calculado',qtd:10},
 fields:[F.sel('banco','Banco (código)',['001 · Banco do Brasil','033 · Santander','104 · Caixa','237 · Bradesco','341 · Itaú','260 · Nu Pagamentos']),F.seg('tipo','Tipo de conta',['Corrente','Poupança']),F.seg('regra','Regra a testar',['DV calculado','DV incorreto','Agência inválida']),F.qtd()],
 note:()=>'Dados sintéticos. O DV usa módulo 11 genérico; o algoritmo específico de cada banco não é simulado no protótipo.',
 one:(v,r)=>{const m11=s=>{let t=0,w=2;for(let i=s.length-1;i>=0;i--){t+=+s[i]*w;w=w===9?2:w+1}const x=11-t%11;return x>=10?'0':String(x)};let ag=digs(r,4).join(''),ct=digs(r,int(r,5,8)).join(''),dv=m11(ct),tag='DV calculado',tone='ok';
  if(v.regra==='DV incorreto'){dv=String((+dv+1+int(r,0,7))%10);tag='DV incorreto';tone='bad'}if(v.regra==='Agência inválida'){ag=ag.slice(0,3);tag='agência com 3 dígitos';tone='bad'}
  return I(tag,tone,[['Conta','conta',`${ct}-${dv}`],['Banco','banco',v.banco],['Agência','agencia',ag],['Tipo','tipo_conta',v.tipo],['DV','dv',dv]],key(v.regra))}},
cartao:{kind:'value',pl:['cartão de teste','cartões de teste'],def:{bandeira:'Visa',produto:'Crédito',origem:'Sintético',regra:'Luhn correto',validade:'Futura',mask:'Com espaços',qtd:1},
 fields:[F.sel('bandeira','Bandeira',['Visa','Mastercard','Elo','Amex','Hipercard']),F.seg('produto','Produto',['Crédito','Débito','Os dois']),F.seg('origem','Origem do número',['Sintético','Sandbox público'],null,v=>v.origem==='Sandbox público'?(SANDBOX[v.bandeira]?'Número público documentado por gateways para ambiente de teste.':'Essa bandeira não tem número sandbox público padronizado; será usado um sintético.'):''),F.seg('regra','Regra do número',['Luhn correto','Luhn incorreto','Comprimento inválido','Formato inválido'],v=>v.origem==='Sintético'),F.seg('validade','Validade',['Futura','Expirada','Mês inválido']),F.seg('mask','Formatação',['Com espaços','Só dígitos']),F.qtd()],
 note:()=>'Números sintéticos ou de sandbox público. Não são cartões reais nem ativos.',
 one:(v,r)=>{const sb=v.origem==='Sandbox público'&&SANDBOX[v.bandeira];let num=sb?SANDBOX[v.bandeira]:cardNum(r,v.bandeira);const len=v.bandeira==='Amex'?15:16;const rg=sb||v.origem!=='Sintético'?'Luhn correto':v.regra;let bad=false;const ch=[];
  if(rg==='Luhn incorreto'){num=num.slice(0,-1)+((+num.slice(-1)+1+int(r,0,7))%10);bad=true}if(rg==='Comprimento inválido'){num=num.slice(0,-2);bad=true}if(rg==='Formato inválido'){const a=num.split('');a[int(r,4,10)]=pick(r,['A','x','O']);num=a.join('');bad=true}
  ch.push(rg==='Luhn incorreto'?['Luhn incorreto','bad']:rg==='Formato inválido'?['Caractere não numérico','bad']:['Luhn válido','ok']);ch.push(num.length===len?[`${len} dígitos`,'ok']:[`${num.length} dígitos (esperado ${len})`,'bad']);
  let exp;if(v.validade==='Expirada'){exp=`${p2(int(r,1,12))}/${((TODAY.getFullYear()-int(r,1,4))%100)}`;ch.push(['Validade expirada','bad']);bad=true}else if(v.validade==='Mês inválido'){exp=`13/${((TODAY.getFullYear()+int(r,1,4))%100)}`;ch.push(['Mês inválido','bad']);bad=true}else{exp=`${p2(int(r,1,12))}/${((TODAY.getFullYear()+int(r,1,4))%100)}`;ch.push(['Validade futura','ok'])}
  ch.push([sb?'Sandbox público':'Sintético','neu']);const p=person(r);const produto=v.produto==='Os dois'?'Crédito e débito':(v.produto||'Crédito');ch.push([produto,'neu']);
  const it=I(bad?'deve ser recusado':'formato aceito',bad?'bad':'ok',[['Número','numero_cartao',v.mask==='Com espaços'?groupCard(num,v.bandeira):num],['Bandeira','bandeira',v.bandeira],['Produto','produto',produto],['Titular','titular',slug(p.first+' '+p.last).toUpperCase()],['Validade','validade',exp],['CVV','cvv',digs(r,v.bandeira==='Amex'?4:3).join('')]],key(rg)+'; validade_'+key(v.validade)+'; '+key(produto));it.checks=ch;return it}},
pix:{kind:'value',pl:['chave PIX','chaves PIX'],def:{tipo:'Aleatória (EVP)',regra:'Formato válido',payload:false,valor:'25,90',crc:'Correto',qtd:10},
 fields:[F.seg('tipo','Tipo de chave',['CPF','CNPJ','E-mail','Telefone','Aleatória (EVP)']),F.seg('regra','Regra da chave',['Formato válido','Formato inválido']),F.tog('payload','Gerar payload copia e cola (BR Code)'),F.txt('valor','Valor (opcional)',v=>v.payload),F.seg('crc','Checksum CRC16',['Correto','Incorreto'],v=>v.payload),F.qtd()],
 note:()=>'Formato válido não significa chave registrada no DICT. Chaves e payloads são sintéticos.',
 one:(v,r)=>{const p=person(r),bad=v.regra==='Formato inválido';let k,why;
  switch(v.tipo){case'CPF':{const c=cpfD(r).join('');k=bad?c.slice(0,10):c;why='CPF com 10 dígitos';break}case'CNPJ':{const c=cnpjS(r,false,false);k=bad?fmtCnpj(c,true):c;why='CNPJ com pontuação';break}case'E-mail':k=bad?p.email.replace('@',''):p.email;why='e-mail sem @';break;case'Telefone':{const t='+55'+DDD[p.uf]+'9'+digs(r,8).join('');k=bad?t.slice(3):t;why='telefone sem +55';break}default:{const u=uuid(r);k=bad?u.replace(/-/g,''):u;why='EVP sem hífens'}}
  const f=[['Chave','chave',k],['Tipo de chave','tipo_chave',v.tipo]];const ch=[[bad?`Formato inválido: ${why}`:'Formato da chave válido',bad?'bad':'ok']];let rule=key(v.regra);
  if(v.payload){let pl=pixPayload(k,v.valor,p);if(v.crc==='Incorreto'){pl=pl.slice(0,-4)+((parseInt(pl.slice(-4),16)+0x1111)&0xFFFF).toString(16).toUpperCase().padStart(4,'0');ch.push(['CRC16 incorreto','bad'])}else ch.push(['CRC16 correto','ok']);f.push(['Valor','valor',v.valor||''],['Recebedor','recebedor',slug(p.first+' '+p.last).toUpperCase()],['Payload copia e cola','payload',pl]);rule+='; crc_'+key(v.crc)}
  const isBad=ch.some(c=>c[1]==='bad');const it=I(isBad?'deve ser recusado':'formato aceito',isBad?'bad':'ok',f,rule);it.checks=ch;return it}},
boleto:{kind:'value',pl:['boleto','boletos'],def:{banco:'001 · Banco do Brasil',vencimento:'Futuro',regra:'DV correto',mask:'Com pontuação',qtd:1},
 fields:[F.sel('banco','Banco (código)',['001 · Banco do Brasil','033 · Santander','104 · Caixa','237 · Bradesco','341 · Itaú','260 · Nu Pagamentos']),F.seg('vencimento','Vencimento',['Futuro','Vencido','Sem vencimento']),F.seg('regra','Regra do boleto',['DV correto','DV incorreto','Comprimento inválido']),F.seg('mask','Linha digitável',['Com pontuação','Só dígitos']),F.qtd()],
 note:()=>'Boleto e PIX sintéticos. A linha digitável, o código de barras e o QR Code seguem o formato, mas não estão registrados nem podem ser pagos.',
 one:(v,r)=>{const bank=String(v.banco||'001').slice(0,3);const p=person(r);const cedente=pick(r,CEDENTES);const nosso=digs(r,10).join('');const ag=digs(r,4).join('');const conta=digs(r,9).join('');const livre=ag+'17'+nosso+conta;const cents=int(r,1000,250000);const valor=(cents/100).toFixed(2).replace('.',',');let due=null,dueTxt='Sem vencimento';
  if(v.vencimento==='Vencido'){due=new Date(TODAY);due.setDate(due.getDate()-int(r,5,40))}else if(v.vencimento!=='Sem vencimento'){due=new Date(TODAY);due.setDate(due.getDate()+int(r,5,40))}
  if(due)dueTxt=`${p2(due.getDate())}/${p2(due.getMonth()+1)}/${due.getFullYear()}`;
  const fat=fatorVenc(due),valorBar=String(cents).padStart(10,'0'),sem=bank+'9'+fat+valorBar+livre;let dv=String(mod11Boleto(sem));let bar=bank+'9'+dv+fat+valorBar+livre;
  let linha=(bar.slice(0,4)+bar.slice(19,24));linha+=mod10(linha);const c2=bar.slice(24,34);linha+=c2+mod10(c2);const c3=bar.slice(34,44);linha+=c3+mod10(c3)+bar[4]+bar.slice(5,19);
  const ch=[];let bad=false;
  if(v.regra==='DV incorreto'){const broken=String((+bar[4]+1)%10);bar=bar.slice(0,4)+broken+bar.slice(5);linha=linha.slice(0,9)+String((+linha[9]+1)%10)+linha.slice(10,32)+broken+linha.slice(33);bad=true;ch.push(['DV geral incorreto','bad'],['DV do campo 1 incorreto','bad'])}else ch.push(['DV geral válido','ok'],['DV dos campos válido','ok']);
  if(v.regra==='Comprimento inválido'){bar=bar.slice(0,-2);linha=linha.slice(0,-2);bad=true;ch.push([`${bar.length} dígitos no código (esperado 44)`,'bad'],[`${linha.length} dígitos na linha (esperado 47)`,'bad'])}else ch.push(['44 dígitos no código','ok'],['47 dígitos na linha','ok']);
  if(v.vencimento==='Vencido'){ch.push(['Vencido','bad']);bad=true}else if(v.vencimento==='Sem vencimento')ch.push(['Sem fator de vencimento','warn']);else ch.push(['Vencimento futuro','ok']);
  ch.push(['QR PIX sintético','neu']);
  const shown=v.mask==='Só dígitos'||linha.length!==47?linha:fmtLinha(linha);
  const payload=pixPayload(uuid(r),valor,{...p,first:cedente,last:''});
  const codigoBanco=bank+'-'+({'001':'9','033':'7','104':'0','237':'2','341':'7','260':'7'}[bank]||'0');
  const dataDoc=`${p2(TODAY.getDate())}/${p2(TODAY.getMonth()+1)}/${TODAY.getFullYear()}`;
  const endereco=`${p.rua}, ${p.numero} — ${p.bairro}, ${p.cidade}/${p.uf} — ${p.cep}`;
  const it=I(bad?'deve ser recusado':'formato aceito',bad?'bad':'ok',[['Linha digitável','linha',shown],['Código de barras','codigo_barras',bar],['Banco','banco',v.banco],['Código do banco','codigo_banco',codigoBanco],['Cedente','cedente',cedente],['Agência','agencia',ag],['Código do beneficiário','codigo_beneficiario',conta],['Carteira','carteira','17'],['Data do documento','data_documento',dataDoc],['Nº do documento','numero_documento',digs(r,8).join('')],['Pagador','pagador',p.nome],['CPF do pagador','cpf',fmtCpf(cpfD(r,p.uf).join(''),true)],['Endereço do pagador','endereco',endereco],['Nosso número','nosso_numero',nosso],['Vencimento','vencimento',dueTxt],['Valor','valor','R$ '+valor],['QR Code PIX','payload',payload]],key(v.regra)+'; '+key(v.vencimento));
  it.checks=ch;return it}},
borda:{kind:'value',pl:['casos de borda','casos de borda'],def:{regra:'Comprimento máximo',limite:255},
 fields:[F.sel('regra','Tipo',['Comprimento máximo','Comprimento mínimo','Valor máximo','Valor mínimo','Nulo e vazio','Caracteres especiais','Valores extremos','Duplicidade']),F.num('limite','Limite da regra',v=>/Comprimento|Valor m|Todas as variações/.test(v.regra),'Gera valores logo abaixo, exatamente no limite e logo acima.')],
 run:(v,r)=>{const L=Math.max(1,parseInt(v.limite)||1);const str=n=>Array.from({length:Math.max(0,n)},(_,i)=>String((i+1)%10)).join('');const it=(val,lbl,tone,exp)=>I(lbl,tone,[['Valor','valor',val],['Comprimento','comprimento',Array.from(val).length]],key(lbl));
  switch(v.regra){case'Comprimento máximo':return[it(str(L-1),`${L-1} · deve aceitar`,'ok'),it(str(L),`${L} · deve aceitar`,'ok'),it(str(L+1),`${L+1} · deve rejeitar`,'bad')];
  case'Comprimento mínimo':return[it(str(L-1),`${L-1} · deve rejeitar`,'bad'),it(str(L),`${L} · deve aceitar`,'ok'),it(str(L+1),`${L+1} · deve aceitar`,'ok')];
  case'Valor máximo':return[it(String(L-1),'limite − 1 · aceitar','ok'),it(String(L),'limite · aceitar','ok'),it(String(L+1),'limite + 1 · rejeitar','bad')];
  case'Valor mínimo':return[it(String(L-1),'limite − 1 · rejeitar','bad'),it(String(L),'limite · aceitar','ok'),it(String(L+1),'limite + 1 · aceitar','ok')];
  case'Nulo e vazio':return[['null','nulo'],['','string vazia'],['   ','só espaços'],['\t\n','tabulação e quebra']].map(([a,b])=>it(a,b,'warn'));
  case'Caracteres especiais':return[["' OR '1'='1",'injeção SQL'],['<script>alert(1)</script>','HTML / XSS'],['Ação Çedilha Ñandú','acentos'],['𝓤𝓷𝓲𝓬𝓸𝓭𝓮','Unicode matemático'],['👩‍💻🏳️‍🌈','emoji com ZWJ'],['texto\u200bcom zero-width','zero-width'],['../../etc/passwd','path traversal'],['%00%0d%0a','bytes de controle']].map(([a,b])=>it(a,b,'warn'));
  case'Valores extremos':return[['2147483647','int32 máximo'],['-2147483648','int32 mínimo'],['2147483648','int32 máximo + 1'],['9007199254740993','acima de MAX_SAFE_INTEGER'],['1.7976931348623157e308','float64 máximo'],['-0','zero negativo'],['NaN','não numérico'],['Infinity','infinito']].map(([a,b])=>it(a,b,'warn'));
  default:{const e='ana.silva@exemplo.com.br';return[[e,'original','ok'],[e,'idêntico','bad'],['Ana.Silva@exemplo.com.br','caixa diferente','warn'],[e+' ','espaço no fim','warn'],[' '+e,'espaço no início','warn']].map(([a,b,t])=>it(a,b,t))}}}},
texto:{kind:'text',def:{modo:'História',medida:'Versão',versao:'Média',tamanho:255,caixa:'Original',acentos:true,emojis:false,especiais:false,capitulos:false,quebras:false,maiusc:true,minusc:true,numeros:true,espacos:false,unicode:false,custom:'',padrao:'abc',limite:0,qtd:1},
 fields:[F.seg('modo','Tipo de texto',['História','Sequência aleatória','Texto repetitivo','Padrão personalizado'],null,v=>({'História':'Uma história curta sobre um bichinho do bosque. Gerar novamente troca o personagem.','Sequência aleatória':'Caracteres sorteados das classes que você marcar.','Texto repetitivo':'Um trecho repetido até o tamanho pedido.','Padrão personalizado':'Uma string montada a partir de uma máscara.'})[v.modo]),
  F.txt('padrao','Padrão',v=>v.modo==='Texto repetitivo'||v.modo==='Padrão personalizado',v=>v.modo==='Padrão personalizado'?'A = maiúscula · a = minúscula · 9 = dígito · * = qualquer · ? = emoji':'Trecho que será repetido.'),
  F.seg('medida','Medir por',v=>v.modo==='História'?['Versão','Caracteres','Palavras','Linhas']:['Caracteres','Palavras','Linhas'],v=>v.modo!=='Padrão personalizado'),
  F.seg('versao','Versão da história',['Curta','Média','Longa','Completa'],v=>v.modo==='História'&&v.medida==='Versão',v=>({Curta:'2 frases.','Média':'1 parágrafo.',Longa:'2 parágrafos.',Completa:'A história inteira, em 4 parágrafos.'})[v.versao]),
  F.num('tamanho',v=>v.medida==='Palavras'?'Quantidade de palavras':v.medida==='Linhas'?'Quantidade de linhas':'Quantidade de caracteres',v=>v.modo!=='Padrão personalizado',v=>v.medida==='Versão'?'Digite um número para ajustar a história a essa quantidade exata de caracteres.':v.modo==='História'&&v.medida==='Caracteres'?'A história é ajustada para ter exatamente essa quantidade de caracteres, terminando em frase.':v.modo==='História'?'Se passar do tamanho da história, ela recomeça.':'',[50,255,1000,100000]),
  F.seg('caixa','Letras',['Original','MAIÚSCULAS','minúsculas'],v=>v.modo==='História'),F.tog('maiusc','Letras maiúsculas',v=>v.modo==='Sequência aleatória',null,'ABC'),F.tog('minusc','Letras minúsculas',v=>v.modo==='Sequência aleatória',null,'abc'),F.tog('numeros','Números',v=>v.modo==='Sequência aleatória',null,'123'),
  F.tog('acentos','Acentos',v=>v.modo==='História'||v.modo==='Sequência aleatória',null,'Ação'),F.tog('emojis','Emojis',v=>v.modo==='História'||v.modo==='Sequência aleatória',null,'🦊'),F.tog('especiais','Caracteres especiais',v=>v.modo==='História'||v.modo==='Sequência aleatória',null,'@ # &'),F.tog('capitulos','Numerar os capítulos',v=>v.modo==='História',null,'1. Bosque\n2. Chave'),F.tog('quebras','Quebras de linha',v=>v.modo==='História'||v.modo==='Sequência aleatória',v=>v.modo==='História'?'Uma frase por linha.':'','frase um\nfrase dois'),
  F.tog('espacos','Espaços',v=>v.modo==='Sequência aleatória',null,'a  b'),F.tog('unicode','Caracteres Unicode (não latinos)',v=>v.modo==='Sequência aleatória',null,'あア'),F.txt('custom','Caracteres personalizados',v=>v.modo==='Sequência aleatória','Adicionados ao conjunto sorteado.'),
  F.num('limite','Limite do campo a validar (0 = sem limite)',null,'Mostra se o texto cabe no campo.',[0,255,4000])]},
estrutura:{kind:'code',def:{formato:'JSON',regra:'Válido',registros:1,campos:['ID'],camposExtras:[],cols:[{id:9001,name:'id',type:'ID'},{id:9002,name:'nome',type:'Nome completo'},{id:9003,name:'cpf',type:'CPF'},{id:9004,name:'email',type:'E-mail'},{id:9005,name:'ativo',type:'Booleano'}],indent:'2 espaços',raiz:'clientes',simbologia:'EAN-13',conteudoModo:'Gerado',conteudo:'',ecc:'M',margem:4,lado:256,regraCodigo:'Válido',qtdCodigos:1,regraQr:'Válido',itens:5,rotulo:'Curto',regraLista:'Válido',niveis:3,filhos:2,saida:'Aninhada',regraHier:'Válido',pontos:6,seriesQtd:1,padrao:'Crescimento',catTipo:'Categorias',saidaSerie:'JSON',intervaloMin:0,intervaloMax:100,casasSerie:0},
 fields:[F.seg('formato','Formato',['JSON','XML','CSV','YAML','SQL','Código de barras','QR Code','Lista','Hierarquia','Série']),
  F.sel('simbologia','Simbologia',['EAN-13','Code 128'],v=>v.formato==='Código de barras'),F.seg('conteudoModo','Conteúdo',v=>v.formato==='QR Code'?['Texto','URL','Informado']:['Gerado','Informado'],v=>v.formato==='Código de barras'||v.formato==='QR Code'),F.txt('conteudo','Valor',v=>(v.formato==='Código de barras'&&v.conteudoModo==='Informado')||(v.formato==='QR Code'&&(v.conteudoModo==='Informado'||v.regraQr==='Payload recusado'))),
  F.sel('ecc','Correção',['L','M','Q','H'],v=>v.formato==='QR Code'),F.num('margem','Margem',v=>v.formato==='QR Code',null,[0,4,8]),F.num('lado','Lado',v=>v.formato==='QR Code',null,[128,256,512]),F.num('qtdCodigos','Quantidade',v=>v.formato==='Código de barras'||v.formato==='QR Code',null,[1,5,10]),
  F.sel('regraCodigo','Regra do símbolo',['Válido','Dígito verificador incorreto','Conteúdo incompatível'],v=>v.formato==='Código de barras'),F.sel('regraQr','Regra do QR',['Válido','Payload recusado','Imagem ilegível'],v=>v.formato==='QR Code','Payload recusado continua legível. Imagem ilegível não decodifica.'),
  F.num('itens','Itens',v=>v.formato==='Lista',null,[3,5,10]),F.seg('rotulo','Rótulos',['Curto','Longo'],v=>v.formato==='Lista'||v.formato==='Série'),F.sel('regraLista','Regra da lista',['Válido','Repetidos','Valores vazios'],v=>v.formato==='Lista'),
  F.num('niveis','Níveis',v=>v.formato==='Hierarquia',null,[2,3,4]),F.num('filhos','Filhos por nível',v=>v.formato==='Hierarquia',null,[1,2,3]),F.seg('saida','Saída',['Aninhada','Plana'],v=>v.formato==='Hierarquia'),F.sel('regraHier','Regra da hierarquia',['Válido','ID duplicado','Pai ausente','Referência circular'],v=>v.formato==='Hierarquia'),
  F.num('pontos','Pontos',v=>v.formato==='Série',null,[6,12,24]),F.num('seriesQtd','Séries',v=>v.formato==='Série',null,[1,2,3]),F.sel('padrao','Padrão',['Crescimento','Queda','Constante','Picos','Negativos','Zeros','Ausentes','Categorias repetidas','Datas fora de ordem'],v=>v.formato==='Série'),F.seg('catTipo','Eixo',['Categorias','Datas'],v=>v.formato==='Série'),F.num('intervaloMin','Mínimo',v=>v.formato==='Série'),F.num('intervaloMax','Máximo',v=>v.formato==='Série'),F.sel('casasSerie','Casas decimais',['0','1','2','3'],v=>v.formato==='Série'),F.seg('saidaSerie','Arquivo',['JSON','CSV'],v=>v.formato==='Série'),
  F.seg('regra','Regra a testar',['Válido','Sintaxe inválida','Campo obrigatório ausente','Tipo incorreto'],v=>classicFmt(v)),F.chips('campos','Campos',()=>['ID'].concat(CT),v=>classicFmt(v),{custom:true,help:'Os nomes prontos cobrem os tipos comuns. Adicione o nome que o seu sistema usa e escolha o tipo do valor.'}),F.num('registros','Registros',v=>classicFmt(v),null,[1,3,10]),F.seg('indent','Indentação',['2 espaços','4 espaços','Minificado'],v=>v.formato==='JSON'),F.txt('raiz','Tabela / elemento raiz',v=>v.formato==='SQL'||v.formato==='XML')]},
mapa:{kind:'value',pl:['coordenada','coordenadas'],def:{tipo:'Ponto',formato:'Decimal',regiao:'Brasil',casas:'6',regra:'Válida',latMin:-23.8,latMax:-23.3,lngMin:-46.9,lngMax:-46.3,qtd:10},
 fields:[F.seg('tipo','Tipo',['Ponto','Área']),F.seg('formato','Formato',['Decimal','Hemisfério','GMS']),F.seg('regiao','Região',['Brasil','Mundo','Informada'],null,'Informada usa o retângulo de latitude e longitude abaixo.'),
  F.num('latMin','Latitude mínima',v=>v.regiao==='Informada'),F.num('latMax','Latitude máxima',v=>v.regiao==='Informada'),F.num('lngMin','Longitude mínima',v=>v.regiao==='Informada'),F.num('lngMax','Longitude máxima',v=>v.regiao==='Informada'),
  F.sel('casas','Casas decimais',['0','2','4','6']),
  F.sel('regra','Regra',v=>['Todas as variações'].concat(v.tipo==='Área'?['Válida','Limites invertidos','Área degenerada','Fora do mapa']:['Válida','Latitude inválida','Longitude inválida','Fora da região','Texto inválido']),null,v=>v.regra==='Fora da região'&&v.regiao==='Mundo'?'Fora da região pede Brasil ou uma área informada.':'Casos negativos são explícitos. O link do mapa só sai quando o ponto ou a área cabe no globo.'),
  F.qtd()],
 note:()=>'Pontos e áreas fictícios para testar mapas. O mapa abaixo da prévia abre na primeira linha quando a coordenada cabe no globo.',
 run:(v,r)=>{
  const rows=coordinateRows({tipo:v.tipo,formato:v.formato,regiao:v.regiao,casas:v.casas,regra:v.regra,latMin:Number(v.latMin),latMax:Number(v.latMax),lngMin:Number(v.lngMin),lngMax:Number(v.lngMax),random:r},Math.max(1,Math.min(+v.qtd||1,1000)));
  if(rows.length===1&&rows[0].rule==='incompativel')return[I(rows[0].tag,'warn',[['Resultado','valor','—'],['Motivo','motivo',rows[0].error||rows[0].why]],'incompativel')];
  const area=v.tipo==='Área';
  return rows.map(row=>I(row.tag,row.tone,[['Valor','valor',row.value],[area?'Latitude sudoeste':'Latitude',area?'lat_sw':'latitude',row.latitude],[area?'Longitude sudoeste':'Longitude',area?'lng_sw':'longitude',row.longitude],[area?'Nordeste':'Hemisfério',area?'nordeste':'hemisferio',row.extra],['Mapa','mapa',row.link],['Regra aplicada','regra',row.why]],row.rule));
 }}
};
ENG.cpf.run=ENG.cnpj.run=null;
Object.values(ENG).forEach(e=>{if(e.one&&!e.run)e.run=(v,r)=>Array.from({length:Math.max(1,Math.min(+v.qtd||1,1000))},()=>e.one(v,r))});
const TODAS='Todas as variações';
const SWEEP={cpf:['regra'],cnpj:['regra'],nome:['regra'],email:['regra'],telefone:['tipo','regra'],cep:['regra'],nascimento:['faixa'],numero:['tipo','regra'],data:['tipo','regra'],bancario:['regra'],cartao:['regra','validade'],pix:['tipo','regra'],boleto:['regra','vencimento'],borda:['regra']};
function sweepCombos(axes){let rows=[{}];for(const axis of axes){const next=[];for(const row of rows)for(const opt of axis.opts)next.push({...row,[axis.k]:opt});rows=next}return rows}
Object.entries(SWEEP).forEach(([id,keys])=>{const e=ENG[id];if(!e||!e.run)return;const axes=keys.map(k=>e.fields.find(f=>f.k===k)).filter(f=>f&&Array.isArray(f.opts));axes.forEach(f=>{if(!f.opts.includes(TODAS))f.opts=[TODAS,...f.opts];const prev=f.help;f.help=v=>{const base=typeof prev==='function'?prev(v):(prev||'');const extra=v[f.k]===TODAS?'Monta uma massa com todas as variações desta lista. A quantidade, quando existe, vale para cada uma.':'';return [base,extra].filter(Boolean).join(' ')}});const original=e.run;e.run=(v,r)=>{const active=axes.filter(f=>v[f.k]===TODAS).map(f=>({k:f.k,opts:f.opts.filter(o=>o!==TODAS)}));if(!active.length)return original(v,r);const out=[];const once=new Set();for(const combo of sweepCombos(active)){if(id==='numero'){const tipo=combo.tipo||v.tipo;if(tipo==='Cor'){if(once.has('Cor'))continue;once.add('Cor')}if(tipo==='Sequência'||v.sinal==='Zero'){const mark=tipo+'|'+(tipo==='Sequência'?'seq':'zero');if(once.has(mark))continue;once.add(mark)}}const produced=original({...v,...combo},r)||[];for(const item of produced){if(item.rule==='nao_se_aplica'||item.rule==='incompativel')continue;const fields=item.fields.slice();for(const axis of active){const keyName=axis.k==='validade'?'regra_validade':axis.k==='regra'||axis.k==='faixa'?'variacao':axis.k;const label=axis.k==='tipo'?'Tipo':axis.k==='validade'?'Validade pedida':'Variação';if(fields.some(field=>field.key===keyName))continue;fields.unshift({k:label,key:keyName,v:String(combo[axis.k])})}out.push({...item,fields});if(out.length>=1000)return out}}return out}});

ENG.numero.quick=v=>{if(v.tipo==='Sequência'||v.sinal==='Zero'||colorTipo(v)||measureTipo(v))return null;const C=numCtx(v);if(C.err)return{title:'Fronteiras do intervalo',help:C.err,items:[]};return{title:`Fronteiras de ${C.fm(C.lo)} a ${C.fm(C.hi)}`,help:C.adj?`Sinal ${v.sinal.toLowerCase()}: ${C.adj}.`:'Seis valores ao redor do mínimo e do máximo configurados.',items:boundary(C).map(b=>({label:b.label,value:C.fm(b.x),rel:b.rel,detail:b.why}))}};
ENG.data.quick=(v,r)=>{if(v.tipo==='Horário')return{title:'Horários de fronteira',help:'Primeiro e último instante do dia e valores impossíveis.',items:[{label:'Início do dia',value:'00:00:00',rel:'lim',detail:'menor horário válido'},{label:'Fim do dia',value:'23:59:59',rel:'lim',detail:'maior horário válido'},{label:'Hora 24',value:'24:00:00',rel:'out',detail:'horas vão de 00 a 23'},{label:'Minuto 60',value:'12:60:00',rel:'out',detail:'minutos vão de 00 a 59'}]};
 let a=parseInt(v.anoMin)||1990,b=parseInt(v.anoMax)||2030;if(a>b)[a,b]=[b,a];const off={'UTC−03:00':-3,'UTC':0,'UTC−05:00':-5,'UTC+01:00':1}[v.fuso]||0;const offS=off===0?'Z':(off<0?'-':'+')+p2(Math.abs(off))+':00';const fd=v.tipo==='Data'||v.tipo==='Data e hora'?v.formato:'DD/MM/AAAA';
 const O=dt=>{const y=dt.getFullYear(),m=dt.getMonth()+1,d=dt.getDate();return v.tipo==='Data'?fmtYMD(y,m,d,fd):v.tipo==='Data e hora'?fmtYMD(y,m,d,fd)+' 00:00:00':v.tipo==='Timestamp Unix'?String(Math.floor(Date.UTC(y,m-1,d)/1000-off*3600)):`${y}-${p2(m)}-${p2(d)}T00:00:00${offS}`};
 const L=dt=>fmtYMD(dt.getFullYear(),dt.getMonth()+1,dt.getDate(),'DD/MM/AAAA');const s=new Date(a,0,1),en=new Date(b,11,31),bf=new Date(a-1,11,31),af=new Date(b+1,0,1),mid=new Date(a,0,1+Math.floor(r()*((en-s)/864e5)));
 const items=[{label:'Dia anterior ao mínimo',value:O(bf),rel:'out',detail:'antes de '+L(s)},{label:'Data mínima',value:O(s),rel:'lim',detail:L(s)},{label:'Dentro do intervalo',value:O(mid),rel:'in',detail:L(mid)},{label:'Data máxima',value:O(en),rel:'lim',detail:L(en)},{label:'Dia posterior ao máximo',value:O(af),rel:'out',detail:'depois de '+L(en)}];
 if(v.tipo==='Data'||v.tipo==='Data e hora')items.push({label:'Data inexistente',value:fmtYMD(a,2,31,fd)+(v.tipo==='Data e hora'?' 00:00:00':''),rel:'out',detail:'31/02/'+a+' não existe'});
 return{title:`Intervalo de ${L(s)} a ${L(en)}`,help:'Ajuste os anos na etapa 3. Os valores seguem o tipo, o formato e o fuso escolhidos.',items}};
const POOLS={maiusc:'ABCDEFGHIJKLMNOPQRSTUVWXYZ',minusc:'abcdefghijklmnopqrstuvwxyz',numeros:'0123456789',acentos:'áàâãéêíóôõúçÁÉÍÓÚÇ',especiais:'!@#$%&*()-_=+[]{};:,.<>/?|~^',espacos:' '};
const EMOJI=['😀','🚀','✅','🔥','🎉','💡','🧪','📦','🐞','⭐','💬','🌱'];
const UNI=['ß','ñ','ø','å','α','β','λ','Ω','ж','щ','я','漢','字','日','本','語','한','글','ع','ر','ب','ש','ל','ก','€','™','∑','√','∞','≠'];
const WORDS='a de o que e do da em um para é com não uma os no se na por mais as dos como mas ao ele das tem seu sua ou ser quando muito já está também só pelo até isso ela entre depois sem mesmo ter quem nas esse eles você essa nem meu minha teste sistema campo valor dado registro cliente arquivo usuário cadastro resultado processo'.split(' ');
const STORY=[["{N} era {A} que morava no oco de uma árvore, na beira de um bosque silencioso.","Todas as manhãs, saía cedo para procurar frutas caídas e gotas de orvalho nas folhas.","Naquele dia, porém, encontrou algo diferente: uma pequena chave dourada presa entre as raízes.","Curioso, {N} guardou a chave e decidiu descobrir qual porta ela abria.","Contou a novidade para a coruja Dona Íris, que sabia de quase tudo no bosque."],
["Dona Íris piscou devagar e disse que, perto do riacho, havia uma porta escondida no tronco de um carvalho.","{N} atravessou a ponte de pedras, contornou o campo de margaridas e seguiu o som da água.","No caminho, encontrou a lontra Maré, que se ofereceu para ajudar na busca.","Os dois procuraram por horas, até que o sol começou a se esconder atrás dos morros.","Quando estavam quase desistindo, Maré apontou para uma fresta coberta de musgo."],
["{N} afastou o musgo com cuidado e viu uma portinha de madeira, pequena o bastante para caber numa pata.","A chave entrou na fechadura com um clique suave, e a porta se abriu sem ranger.","Lá dentro, havia prateleiras cheias de sementes, cada uma guardada num potinho com etiqueta.","Em uma das etiquetas estava escrito: para quem cuidar do bosque no próximo inverno.","{N} entendeu que aquele era um presente antigo, deixado por alguém que também amava aquele lugar."],
["Nas semanas seguintes, {N} e Maré plantaram as sementes ao longo do riacho.","Quando a primavera chegou, o bosque se encheu de flores que ninguém ali tinha visto antes.","Os outros animais vinham de longe para ver as cores novas e perguntar de onde elas tinham vindo.","{N} apenas sorria e mostrava a chave dourada, que agora carregava sempre consigo.","E, antes de dormir, pensava em quem encontraria a próxima porta escondida no bosque."]];
const PETS=[['Pipo','um pequeno ouriço'],['Tobias','um pequeno tatu'],['Bento','um pequeno coelho'],['Nico','um pequeno esquilo']];
const SEMO=['🌳','🍎','🔑','🦉','🌼','🌊','🌙','🌱','🌸','✨'];
function fitText(tk,N){if(N<=0)return'';const L=s=>Array.from(s).length,P=/[.!?…]$/;const inc=[];let tot=0;
 for(const x of tk){const c=L(x.sep+x.t);if(tot+c<=N-1||(tot+c===N&&P.test(x.t))){inc.push({sep:x.sep,t:x.t});tot+=c;if(tot===N)break}else break}
 if(!inc.length){const s=Array.from(tk.length?tk[0].t:'');return s.slice(0,N).join('')+'.'.repeat(Math.max(0,N-s.length))}
 const last=inc[inc.length-1];if(!P.test(last.t)){const st=last.t.replace(/[,;:—«]+$/,'');tot-=L(last.t)-L(st);last.t=st+'.';tot++}
 let gap=N-tot;for(const step of [3,1])for(let i=0;i<inc.length-1&&gap>0;i+=step){const x=inc[i];if(/[\p{L}\p{N}»]$/u.test(x.t)&&!/\n/.test(inc[i+1].sep)){x.t+=',';gap--}}
 while(gap-->0)last.t+='.';return inc.map(x=>x.sep+x.t).join('')}
function storyText(v,r,N){const p=pick(r,PETS),nm=p[0];const flat=[];STORY.forEach((pp,pi)=>pp.forEach((s,si)=>flat.push({s:s.replace(/\{N\}/g,nm).replace(/\{A\}/g,p[1]),pi,si})));
 const tf=(o,k)=>{let x=o.s;if(v.especiais)x=x.split(nm).join('«'+nm+'»').replace(/ e /,' & ');if(v.acentos===false)x=x.normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(v.caixa==='MAIÚSCULAS')x=x.toLocaleUpperCase('pt-BR');else if(v.caixa==='minúsculas')x=x.toLocaleLowerCase('pt-BR');if(v.emojis)x+=' '+SEMO[k%SEMO.length];return x};
 const seq=n=>Array.from({length:n},(_,k)=>flat[k%flat.length]);
 const asm=list=>{let o='';list.forEach((it,k)=>{const x=tf(it,k);const head=v.capitulos&&it.si===0?'Capítulo '+(Math.floor(k/flat.length)*STORY.length+it.pi+1)+' — ':'';o+=k===0?head+x:it.si===0?'\n\n'+head+x:(v.quebras?'\n':' ')+x});return o};
 if(v.medida==='Versão'){const n={Curta:2,'Média':5,Longa:10,Completa:flat.length}[v.versao]||5;return asm(seq(n))}
 if(v.medida==='Linhas')return seq(N).map((o,k)=>tf(o,k)).join('\n');
 const txt=asm(seq(Math.max(1,Math.ceil((v.medida==='Palavras'?N*7:N)/70)+3)));const tk=[];txt.split(/(\s+)/).forEach((x,i,a)=>{if(i%2===0&&x)tk.push({sep:i>0?a[i-1]:'',t:x})});
 if(v.medida==='Palavras'){const s=tk.slice(0,N);if(s.length){const l=s[s.length-1];if(!/[.!?…]$/.test(l.t))l.t=l.t.replace(/[,;:—«]+$/,'')+'.'}return s.map(x=>x.sep+x.t).join('')}
 return fitText(tk,N)}
function genText(v,r){const N=Math.max(0,Math.min(parseInt(v.tamanho)||0,1000000));const m=v.modo;const med=v.medida==='Versão'&&m!=='História'?'Caracteres':v.medida;
 if(m==='História')return storyText(v,r,N);
 if(m==='Padrão personalizado'){const all=Object.values(POOLS).join('');return Array.from(v.padrao||'').map(c=>c==='A'?pick(r,POOLS.maiusc):c==='a'?pick(r,POOLS.minusc):c==='9'?pick(r,POOLS.numeros):c==='*'?pick(r,all):c==='?'?pick(r,EMOJI):c).join('')}
 if(m==='Texto repetitivo'){const u=Array.from(v.padrao||'abc');if(!u.length)return'';if(med==='Palavras')return Array.from({length:N},()=>u.join('')).join(' ');if(med==='Linhas')return Array.from({length:N},()=>u.join('')).join('\n');return Array.from({length:N},(_,i)=>u[i%u.length]).join('')}
 let toks=[];const classes=[];['maiusc','minusc','numeros','acentos','especiais','espacos'].forEach(k=>{if(v[k]){const a=Array.from(POOLS[k]);toks=toks.concat(a);classes.push(a)}});if(v.emojis){toks=toks.concat(EMOJI);classes.push(EMOJI)}if(v.unicode){toks=toks.concat(UNI);classes.push(UNI)}const c=Array.from(v.custom||'');if(c.length){toks=toks.concat(c);classes.push(c)}if(!toks.length)toks=Array.from(POOLS.minusc);
 const noSp=toks.filter(t=>t!==' ');const P=noSp.length?noSp:toks;
 if(med==='Palavras')return Array.from({length:N},()=>Array.from({length:int(r,3,8)},()=>pick(r,P)).join('')).join(' ');
 if(med==='Linhas')return Array.from({length:N},()=>Array.from({length:int(r,30,60)},()=>pick(r,toks)).join('')).join('\n');
 const out=Array.from({length:N},()=>pick(r,toks));if(N>=classes.length){const pos=Array.from({length:N},(_,i)=>i).sort(()=>r()-.5);classes.forEach((cl,i)=>out[pos[i]]=pick(r,cl))}
 if(v.quebras)for(let i=40;i<N-1;i+=int(r,30,60))out[i]='\n';return out.join('')}
const SK=c=>c==='ID'?'id':key(c);const SNUM=['Número inteiro','Idade','Decimal','Valor monetário','Porcentagem'];
function genStruct(v,r){const special=buildStructured(v,r);if(special)return special;const n=Math.max(1,Math.min(parseInt(v.registros)||1,100));const LEG={id:'ID',nome:'Nome completo',cpf:'CPF',email:'E-mail',nascimento:'Data de nascimento',ativo:'Booleano',saldo:'Valor monetário'};let dfs=Array.isArray(v.cols)?v.cols.filter(c=>c.type).map(c=>({t:c.type,k:String(c.name||'').trim()||SK(c.type)})):(v.campos&&v.campos.length?v.campos:['ID']).map(c=>LEG[c]||c).map(t=>({t,k:SK(t)}));if(!dfs.length)dfs=[{t:'ID',k:'id'}];const labels=dfs.map(d=>d.t),cols=dfs.map(d=>d.k);
 const recs=Array.from({length:n},(_,i)=>{const p=person(r);const o={};labels.forEach((c,ci)=>{let x;if(c==='ID')x=i+1;else{x=ctVal(c,'Válido',r,p).t;if(c==='Booleano')x=/^(true|sim|1)$/i.test(String(x))?true:/^(false|não|nao|0)$/i.test(String(x))?false:r()<.7;else if(SNUM.includes(c)){const nx=Number(String(x).replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.'));if(!isNaN(nx)&&String(x).trim()!=='')x=nx}}o[cols[ci]]=x});return o});
 let info='',tone='ok',tag=`${v.formato} válido`;
 if(v.regra==='Campo obrigatório ausente'){delete recs[0][cols[0]];info=`Campo "${cols[0]}" ausente no registro 1.`;tone='bad';tag='campo ausente'}
 if(v.regra==='Tipo incorreto'){const k=cols.find(c=>typeof recs[0][c]==='number'||typeof recs[0][c]==='boolean');if(k){recs[0][k]=typeof recs[0][k]==='boolean'?'sim':'um';info=`Campo "${k}" com tipo incorreto no registro 1.`}else info='Inclua ID, Booleano ou um campo numérico para testar tipo incorreto.';tone='bad';tag='tipo incorreto'}
 const root=v.raiz||'registros',el=root.replace(/s$/,'')||'item';const esc=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;');let code;
 if(v.formato==='JSON')code=JSON.stringify(recs.length===1?recs[0]:recs,null,v.indent==='Minificado'?0:v.indent==='4 espaços'?4:2);
 else if(v.formato==='XML')code=`<?xml version="1.0" encoding="UTF-8"?>\n<${root}>\n`+recs.map(o=>`  <${el}>\n`+Object.entries(o).map(([k,x])=>`    <${k}>${esc(x)}</${k}>`).join('\n')+`\n  </${el}>`).join('\n')+`\n</${root}>`;
 else if(v.formato==='CSV'){const q=x=>x===undefined?'':typeof x==='string'?'"'+x.replace(/"/g,'""')+'"':String(x);code=[cols.join(','),...recs.map(o=>cols.map(c=>q(o[c])).join(','))].join('\n')}
 else if(v.formato==='YAML'){const y=x=>typeof x==='string'?'"'+x+'"':String(x);code=recs.length===1?Object.entries(recs[0]).map(([k,x])=>`${k}: ${y(x)}`).join('\n'):recs.map(o=>Object.entries(o).map(([k,x],i)=>`${i?'  ':'- '}${k}: ${y(x)}`).join('\n')).join('\n')}
 else{const q=x=>typeof x==='string'?"'"+x.replace(/'/g,"''")+"'":typeof x==='boolean'?(x?'TRUE':'FALSE'):String(x);code=recs.map(o=>`INSERT INTO ${root} (${Object.keys(o).join(', ')}) VALUES (${Object.values(o).map(q).join(', ')});`).join('\n')}
 if(v.regra==='Sintaxe inválida'){tone='bad';tag='sintaxe inválida';if(v.formato==='JSON'){code=code.replace(/"([^"]+)":/,'"$1"');info='Falta ":" após a primeira chave.'}else if(v.formato==='XML'){code=code.replace(`</${cols[0]}>`,'');info=`Tag <${cols[0]}> sem fechamento.`}else if(v.formato==='CSV'){const l=code.split('\n');if(l[1])l[1]='"'+l[1];code=l.join('\n');info='Aspas abertas e não fechadas na linha 2.'}else if(v.formato==='YAML'){const l=code.split('\n');if(l[1])l[1]=' '+l[1];code=l.join('\n');info='Indentação inconsistente na linha 2.'}else{code=code.replace(/\);/,';');info='Parêntese não fechado no primeiro INSERT.'}}
 return{code,tag,tone,info}}

const FAM=[{n:'Documentos',x:'PDF DOC DOCX XLS XLSX PPT PPTX ODT ODP ODS TXT'},{n:'Imagens',x:'JPG JPEG PNG GIF'},{n:'Compactados',x:'ZIP RAR'},{n:'E-mails',x:'MSG EML'},{n:'Mídia',x:'MP3 MP4 WAV AVI'},{n:'Executáveis e instaladores',x:'EXE PIF APPLICATION GADGET MSI MSP COM SCR',inert:1},{n:'Scripts',x:'BAT CMD VB VBS VBE JS JSE WS WSF WSC WSH',inert:1},{n:'PowerShell e shells',x:'PS1 PS1XML PS2 PS2XML PSC1 PSC2 MSH MSH1 MSH2 MSHXML MSH1XML MSH2XML',inert:1},{n:'Sistema',x:'HTA CPL MSC SCF LNK INF REG',inert:1},{n:'Java e web',x:'JAR JSP JSPX JSW JSV JSPF WSS DO ACTION',inert:1}].map(f=>Object.assign(f,{exts:f.x.split(' ')}));
const INERT=new Set([].concat(...FAM.filter(f=>f.inert).map(f=>f.exts)));
const REAL=new Set('PDF DOCX XLSX PPTX ODT ODP ODS TXT JPG JPEG PNG GIF ZIP EML WAV AVI'.split(' '));
const FILE_DEF={sel:['PDF'],q:'',nome:'arquivo_teste',nomeVar:'Simples',vazio:false,tam:1,unid:'MB',conteudo:'Estrutura real',real:'PNG',qtd:1,audioDur:2,audioKind:'Tom de teste',audioChannels:1,audioRate:44100,videoDur:2,videoRes:'320×180',videoOrient:'Horizontal',videoFps:8,videoAudio:false,imgFundo:'Opaco',imgGif:'Estático',imgQuadros:4,imgFrameMs:200,imgProp:'Horizontal',imgQual:80,imgExif:'Sem EXIF'};
const CONT_HELP={'Estrutura real':'Abre no programa do formato. MP3 e MP4 continuam simulados; WAV e AVI saem reproduzíveis.','Simulado':'Bytes aleatórios com a extensão escolhida. Serve para testar extensão e tamanho, não leitura.','Corrompido':'Começa com o cabeçalho correto do formato; o restante é inválido.','Truncado':'Arquivo real interrompido em cerca de 60% do tamanho.','Extensão divergente':'O conteúdo é de um formato e a extensão é de outro.'};
const realFile=v=>!v.vazio&&v.conteudo==='Estrutura real';
const FILE_FIELDS=[F.txt('nome','Nome base'),F.seg('nomeVar','Característica do nome',['Simples','Com espaços','Acentos','255 caracteres','Dupla extensão']),F.tog('vazio','Arquivo vazio (0 B)'),F.num('tam','Tamanho',v=>!v.vazio,null,[1,10,100]),F.seg('unid','Unidade',['B','KB','MB','GB'],v=>!v.vazio),F.seg('conteudo','Conteúdo',['Estrutura real','Simulado','Corrompido','Truncado','Extensão divergente'],v=>!v.vazio,v=>CONT_HELP[v.conteudo]),F.sel('real','Conteúdo real de',['PDF','PNG','ZIP','TXT','DOCX'],v=>!v.vazio&&v.conteudo==='Extensão divergente'),
 F.num('audioDur','Duração do áudio (s)',v=>realFile(v)&&v._audio,v=>v._mp3?'Vale para o WAV. MP3 continua simulado.':'O tamanho em bytes sai da duração, dos canais e da taxa.',[1,2,5]),F.seg('audioKind','Áudio',['Silêncio','Tom de teste','Áudio de exemplo'],v=>realFile(v)&&v._audio),F.seg('audioChannels','Canais',['1','2'],v=>realFile(v)&&v._audio),F.sel('audioRate','Taxa (Hz)',['8000','22050','44100','48000'],v=>realFile(v)&&v._audio),
 F.num('videoDur','Duração do vídeo (s)',v=>realFile(v)&&v._video,v=>v._mp4?'Vale para o AVI. MP4 continua simulado.':'AVI sem compressão. O navegador pode não reproduzir; um player de vídeo abre.',[1,2]),F.sel('videoRes','Resolução',['160×90','320×180','640×360'],v=>realFile(v)&&v._video),F.seg('videoOrient','Orientação',['Horizontal','Vertical'],v=>realFile(v)&&v._video),F.sel('videoFps','Quadros por segundo',['8','12','15'],v=>realFile(v)&&v._video),F.tog('videoAudio','Com áudio',v=>realFile(v)&&v._video),
 F.seg('imgProp','Proporção',['Horizontal','Vertical','Quadrada','Muito larga','Muito alta'],v=>realFile(v)&&(v._png||v._gif||v._jpg)),F.seg('imgFundo','Fundo',['Opaco','Transparente'],v=>realFile(v)&&(v._png||v._gif||v._jpg),'JPG não aceita transparência.'),F.num('imgQual','Qualidade JPEG',v=>realFile(v)&&v._jpg,null,[60,80,90]),F.sel('imgExif','EXIF',['Sem EXIF','1 · normal','3 · 180°','6 · 90° horário','8 · 90° anti-horário'],v=>realFile(v)&&v._jpg,'Metadado de orientação, separado dos pixels.'),
 F.seg('imgGif','GIF',['Estático','Animado'],v=>realFile(v)&&v._gif),F.num('imgQuadros','Quadros',v=>realFile(v)&&v._gif&&v.imgGif==='Animado','De 2 a 12.',[2,4,8]),F.num('imgFrameMs','Duração do quadro (ms)',v=>realFile(v)&&v._gif&&v.imgGif==='Animado',null,[100,200,500]),
 F.qtd(null,'Arquivos por extensão')];
const fmtBytes=b=>b<1024?`${b} B`:b<1048576?`${(b/1024).toFixed(1).replace('.',',')} KB`:b<1073741824?`${(b/1048576).toFixed(1).replace('.',',')} MB`:`${(b/1073741824).toFixed(2).replace('.',',')} GB`;
function fileName(fv,ext,idx){const base=fv.nome||'arquivo';const e=ext.toLowerCase();let stem;switch(fv.nomeVar){case'Com espaços':stem=base.replace(/_/g,' ')+' final'+idx.replace('_',' ');break;case'Acentos':stem=base+'_relatório_ação'+idx;break;case'255 caracteres':stem=(base+idx).padEnd(255-e.length-1,'x');break;case'Dupla extensão':return `${base}${idx}.${e==='pdf'?'txt':'pdf'}.${e}`;default:stem=base+idx}return `${stem}.${e}`}
function fileInfo(fv,ext){const inert=INERT.has(ext),e=ext.toLowerCase();let tag,tone,desc;
 if(fv.vazio){tag='Vazio';tone='neu';desc='0 bytes, sem cabeçalho'}else if(fv.conteudo==='Estrutura real'){if(inert){tag='Fixture inerte';tone='neu';desc='Cabeçalho do formato quando aplicável, sem código executável'}else if(ext==='MP3'){tag='Simulado';tone='warn';desc='MP3 não é gerado como áudio reproduzível. Use WAV.'}else if(ext==='MP4'){tag='Simulado';tone='warn';desc='MP4 não é gerado como vídeo reproduzível. Use AVI.'}else if(ext==='WAV'){tag='Áudio reproduzível';tone='ok';desc='WAV PCM. O tamanho em bytes é o da duração, dos canais e da taxa.'}else if(ext==='AVI'){tag='Vídeo reproduzível';tone='ok';desc='AVI sem compressão, com o visual de exemplo. Abre em um player de vídeo.'}else if(ext==='PNG'||ext==='GIF'||ext==='JPG'||ext==='JPEG'){tag='Imagem real';tone='ok';const bits=[];bits.push(fv.imgFundo==='Transparente'&&(ext==='PNG'||ext==='GIF')?'fundo transparente':'fundo opaco');if(ext==='GIF'&&fv.imgGif==='Animado')bits.push(`${fv.imgQuadros||4} quadros`);if((ext==='JPG'||ext==='JPEG')&&fv.imgExif&&fv.imgExif!=='Sem EXIF')bits.push(`EXIF ${fv.imgExif}`);bits.push(fv.imgProp||'Horizontal');desc=`Imagem real, ${bits.join(', ')}. O tamanho em bytes é o do arquivo gerado.`}else if(REAL.has(ext)){tag='Estruturalmente válido';tone='ok';desc='Abre normalmente no programa do formato'}else{tag='Simulado';tone='warn';desc=`Estrutura real de .${e} indisponível no protótipo`}}
 else if(fv.conteudo==='Simulado'){tag='Simulado';tone='neu';desc='Bytes aleatórios com a extensão escolhida'}else if(fv.conteudo==='Corrompido'){tag='Corrompido';tone='bad';desc='Cabeçalho correto, corpo inválido'}else if(fv.conteudo==='Truncado'){tag='Truncado';tone='bad';desc='Interrompido em ~60% do tamanho'}else{tag='Extensão divergente';tone='warn';desc=`Conteúdo ${fv.real} com extensão .${e}`}
 if(inert&&!fv.vazio&&fv.conteudo!=='Estrutura real')desc+=' · inerte';return{tag,tone,desc}}

const ALL=['Word','Excel','PowerPoint','PDF'];
const CS={
 cabecalho:{label:'Cabeçalho',fmts:['Word','PDF'],def:{texto:'MassForge · documento de teste'},fields:[F.txt('texto','Texto')]},
 titulo:{label:'Título',fmts:['Word','PDF','PowerPoint'],def:{texto:'Relatório de testes',nivel:'H1'},fields:[F.txt('texto','Texto'),F.seg('nivel','Nível',['H1','H2','H3'])]},
 subtitulo:{label:'Subtítulo',fmts:['Word','PDF','PowerPoint'],def:{texto:'Resumo da execução'},fields:[F.txt('texto','Texto')]},
 paragrafo:{label:'Parágrafo',fmts:['Word','PDF','PowerPoint'],def:{qtd:2,tam:'Médio',negrito:false,italico:false},fields:[F.num('qtd','Quantidade',null,null,[1,2,5]),F.seg('tam','Tamanho',['Curto','Médio','Longo']),F.tog('negrito','Negrito'),F.tog('italico','Itálico')]},
 lista:{label:'Lista',fmts:['Word','PDF','PowerPoint'],def:{tipo:'Marcadores',itens:4},fields:[F.seg('tipo','Tipo',['Marcadores','Numerada']),F.num('itens','Itens')]},
 tabela:{label:'Tabela',fmts:ALL,def:{linhas:5,colunas:3,cab:true},fields:[F.num('linhas','Linhas'),F.num('colunas','Colunas'),F.tog('cab','Linha de cabeçalho')]},
 imagem:{label:'Imagem',fmts:ALL,def:{fmt:'PNG',dim:'1280×720',legenda:true},fields:[F.seg('fmt','Formato',['PNG','JPG']),F.sel('dim','Dimensões',['640×480','1280×720','1920×1080']),F.tog('legenda','Legenda')]},
 grafico:{label:'Gráfico',fmts:ALL,def:{tipo:'Barras',pontos:6},fields:[F.seg('tipo','Tipo',['Barras','Linhas','Pizza']),F.num('pontos','Pontos de dados')]},
 link:{label:'Hiperlink',fmts:['Word','PDF','PowerPoint'],def:{texto:'Documentação do sistema',url:'https://exemplo.com.br/docs'},fields:[F.txt('texto','Texto'),F.txt('url','URL')]},
 comentario:{label:'Comentário',fmts:['Word','Excel'],def:{texto:'Revisar este trecho',autor:'QA'},fields:[F.txt('texto','Texto'),F.txt('autor','Autor')]},
 formula:{label:'Fórmulas',fmts:['Excel'],def:{func:'SOMA',qtd:3,erro:false},fields:[F.sel('func','Função',['SOMA','MÉDIA','PROCV','SE','CONT.SE']),F.num('qtd','Quantidade'),F.tog('erro','Incluir erro #DIV/0!')]},
 quebra:{label:'Quebra de página',fmts:['Word','PDF'],def:{},fields:[]},
 aba:{label:'Aba',fmts:['Excel'],def:{nome:'Clientes',linhas:20,colunas:6},fields:[F.txt('nome','Nome da aba'),F.num('linhas','Linhas'),F.num('colunas','Colunas')]},
 slide:{label:'Slide',fmts:['PowerPoint'],def:{layout:'Título e conteúdo'},fields:[F.seg('layout','Layout',['Título','Título e conteúdo','Em branco'])]},
 rodape:{label:'Rodapé',fmts:['Word','PDF','PowerPoint'],def:{texto:'Dados fictícios para teste',num:true},fields:[F.txt('texto','Texto'),F.tog('num','Numeração de página')]}
};
const DOC_FIELDS=[F.txt('nome','Nome do arquivo'),F.txt('titulo','Título (metadados)'),F.txt('autor','Autor (metadados)'),F.seg('pagina','Página',['A4','Carta'],v=>v.fmt==='Word'||v.fmt==='PDF'),F.seg('orient','Orientação',['Retrato','Paisagem'],v=>v.fmt==='Word'||v.fmt==='PDF'),F.seg('conteudo','Volume de conteúdo',['Normal','Extenso'],null,v=>v.conteudo==='Extenso'?'Multiplica parágrafos e linhas de tabela por 10 no arquivo gerado.':'')];
const DEFAULT_COMPS={Word:[['cabecalho'],['titulo'],['paragrafo'],['tabela'],['imagem'],['grafico'],['rodape']],Excel:[['aba'],['tabela'],['formula'],['grafico'],['aba',{nome:'Resumo',linhas:8,colunas:3}],['comentario']],PowerPoint:[['slide',{layout:'Título'}],['titulo',{texto:'Resultados do sprint'}],['subtitulo',{texto:'Equipe de QA'}],['slide'],['lista'],['slide'],['grafico'],['rodape']],PDF:[['cabecalho'],['titulo'],['paragrafo',{qtd:10}],['tabela'],['link'],['rodape']]};
const PARA=['Este documento foi gerado automaticamente para validar o processamento de arquivos.','Os dados apresentados são fictícios e não representam pessoas ou empresas reais.','Cada seção contém elementos usados em cenários de teste de importação.','A formatação inclui variações de estilo para verificar a renderização.','Valores numéricos e datas seguem o padrão brasileiro.','O conteúdo pode ser substituído sem afetar a estrutura do documento.'];
const LIST_ITEMS=['Validar campos obrigatórios','Conferir formatação de datas','Testar limite de caracteres','Verificar anexos','Revisar mensagens de erro','Confirmar exportação'];

const CT=['Nome completo','Nome','Sobrenome','CPF','CNPJ','E-mail','Telefone','CEP','Endereço','Cidade','UF','Data de nascimento','Idade','Data','Data e hora','Número inteiro','Decimal','Valor monetário','Porcentagem','Cor','Comprimento','Massa','Volume','Coordenada','Booleano','Status','Texto curto','Descrição','Código (AAA-9999)','SKU','Cartão','Chave PIX','Conta bancária','UUID'];
function ctVal(t,rule,r,p){const bad=rule==='Inválido'||(rule==='Misto'&&r()<.5);let v;switch(t){case'Nome completo':v=bad?'':p.nome;break;case'CPF':{const d=cpfD(r);if(bad)d[10]=(d[10]+1)%10;v=fmtCpf(d.join(''),true);break}case'CNPJ':{let c=cnpjS(r,false,false);if(bad)c=c.slice(0,13)+((+c[13]+1)%10);v=fmtCnpj(c,true);break}case'E-mail':v=bad?p.email.replace('@',''):p.email;break;case'Telefone':v=bad?p.tel.replace(/^\((\d\d)\)/,'(20)'):p.tel;break;case'CEP':v=bad?'00000-000':p.cep;break;case'Data de nascimento':v=bad?`31/04/${int(r,1960,2005)}`:`${p2(int(r,1,28))}/${p2(int(r,1,12))}/${int(r,1960,2005)}`;break;case'Cartão':{let n=cardNum(r,'Visa');if(bad)n=n.slice(0,-1)+((+n.slice(-1)+1)%10);v=groupCard(n,'Visa');break}case'Chave PIX':v=bad?uuid(r).replace(/-/g,''):uuid(r);break;
 case'Nome':v=bad?'':p.first;break;case'Sobrenome':v=bad?'':p.last;break;case'Endereço':v=bad?'':`${p.rua}, ${p.numero} – ${p.bairro}`;break;case'Cidade':v=bad?'':p.cidade;break;case'UF':v=bad?pick(r,['XX','S','SPP']):p.uf;break;
 case'Idade':v=bad?String(pick(r,[-1,151,'dez'])):String(int(r,18,80));break;
 case'Data':{const y=int(r,2000,2030),m=int(r,1,12);v=bad?pick(r,[`31/04/${y}`,`30/02/${y}`,`15/13/${y}`]):`${p2(int(r,1,dim(y,m)))}/${p2(m)}/${y}`;break}
 case'Data e hora':{const y=int(r,2000,2030),m=int(r,1,12);v=bad?`${y}-${p2(m)}-${p2(int(r,1,28))}T25:61:00`:`${y}-${p2(m)}-${p2(int(r,1,dim(y,m)))}T${p2(int(r,0,23))}:${p2(int(r,0,59))}:${p2(int(r,0,59))}-03:00`;break}
 case'Número inteiro':v=bad?pick(r,['abc','12a','1.5']):String(int(r,1,1000));break;case'Decimal':v=bad?pick(r,['1,2,3','abc','1..5']):(r()*1000).toFixed(2).replace('.',',');break;
 case'Valor monetário':v=bad?pick(r,['R$ -','R$ abc','R$ 10,999']):'R$ '+(r()*10000).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});break;
 case'Porcentagem':v=bad?pick(r,['120%','-5%','abc%']):(r()*100).toFixed(1).replace('.',',')+'%';break;
 case'Booleano':v=bad?pick(r,['talvez','2','sim?']):String(r()<.5);break;case'Status':v=bad?'desconhecido':pick(r,['ativo','inativo','pendente','bloqueado']);break;
 case'Texto curto':v=bad?'':pick(r,['Cliente prefere contato por e-mail.','Entrega no período da tarde.','Pedido revisado pela equipe.','Aguardando confirmação do pagamento.','Sem observações.']);break;
 case'Descrição':v=bad?'':descriptionValue(r,'Média');break;
 case'SKU':v=bad?'':skuValue(r,8);break;
 case'Cor':v=colorCell(r,bad);break;
 case'Comprimento':case'Massa':case'Volume':v=measureCell(t,r,bad);break;
 case'Coordenada':v=coordinateCell(r,bad);break;
 case'Código (AAA-9999)':v=bad?pick(r,['AA-999','AAAA-99999','A1A-99X9']).replace(/A/g,()=>pick(r,POOLS.maiusc.split(''))):Array.from('AAA-9999').map(c=>c==='A'?pick(r,POOLS.maiusc.split('')):c==='9'?String(int(r,0,9)):c).join('');break;
 case'Conta bancária':{const ct=digs(r,int(r,5,8)).join('');let t=0,w=2;for(let i=ct.length-1;i>=0;i--){t+=+ct[i]*w;w=w===9?2:w+1}let dv=11-t%11;dv=dv>=10?0:dv;if(bad)dv=(dv+1)%10;v=`${ct}-${dv}`;break}
 default:v=bad?uuid(r).slice(0,30):uuid(r)}return{t:v,bad}}

const CATS=[
{id:'arquivos',name:'Arquivos',icon:'file',desc:'Arquivos de qualquer extensão, tamanho e validade para testar upload e processamento.',cards:[{name:'Gerador de arquivos',eng:'files',desc:'Extensões, tamanho, conteúdo e testes negativos.',kw:'upload wav avi mp3 mp4 png gif jpg imagem audio video'}]},
{id:'documentos',name:'Documentos',icon:'doc',desc:'Word, Excel, PowerPoint e PDF montados com os componentes que você escolher.',count:'4 formatos · 1 tela',cards:[{name:'Documentos',eng:'composer',desc:'Escolha o formato e monte o documento com os componentes compatíveis.',kw:'word docx excel xlsx powerpoint pptx pdf documento planilha apresentação'}]},
{id:'textos',name:'Textos',icon:'text',desc:'Uma história de base que você adapta: tamanho exato, acentos, emojis, símbolos e quebras de linha.',count:'4 tipos · 1 tela',cards:[{name:'Textos',eng:'texto',desc:'Comece pela história do bichinho e ajuste tamanho e características numa só tela.',kw:'texto história caracteres 255 limite emojis unicode especiais acentos repetitivo padrão sequência aleatório volume'}]},
{id:'pessoais',name:'Dados pessoais',icon:'user',desc:'Identidade fictícia completa ou parcial, com CPF, e-mail, telefone e endereço coerentes.',count:'Identidade fictícia · 1 tela',direct:true,cards:[{name:'Identidade fictícia',eng:'identidade',desc:'Ficha com nome, nascimento, CPF, e-mail, telefone e endereço; escolha os campos e as regras.',kw:'pessoa cadastro ficha rg carteira'},{name:'CPF',eng:'cpf',desc:'Com dígito verificador correto ou incorreto, com ou sem máscara.'},{name:'CNPJ',eng:'cnpj',desc:'Numérico ou alfanumérico, matriz ou filial, válido ou inválido.'},{name:'Nome',eng:'nome',desc:'Comuns, acentuados, muito longos ou com apóstrofo e hífen.'},{name:'E-mail',eng:'email',desc:'Válidos ou quebrados: sem @, domínio inválido, espaços, acima de 254.'},{name:'Telefone',eng:'telefone',desc:'Celular ou fixo, com DDD real ou inexistente.'},{name:'CEP',eng:'cep',desc:'Na faixa do estado ou em formatos inválidos.'},{name:'Endereço',eng:'endereco',desc:'Endereço completo fictício em uma linha e por campos.'},{name:'Data de nascimento',eng:'nascimento',desc:'Maior ou menor de idade, 18 anos hoje, centenários e datas futuras.'}]},
{id:'numeros',name:'Números e valores',icon:'hash',desc:'Inteiros, decimais, percentuais, monetários, cores, medidas e sequências, dentro ou fora de limites.',count:'9 tipos de valor · 1 tela',cards:[{name:'Números e valores',eng:'numero',desc:'Tipo, sinal, intervalo, cor, medida, formatação e fronteiras numa só tela.',kw:'inteiro inteiros decimal decimais negativo negativos porcentagem porcentagens percentual monetário monetarios dinheiro real sequência sequencias mínimo máximo minimos maximos fronteira limite cor hex rgb medida comprimento massa volume'}]},
{id:'financeiro',name:'Financeiro e bancário',icon:'card',count:'4 tipos',desc:'Cartões de teste, chaves e payloads PIX, dados bancários e boletos sintéticos.',cards:[{name:'Cartões',eng:'cartao',desc:'Número com Luhn correto ou incorreto, validade, CVV e titular fictícios.'},{name:'PIX',eng:'pix',desc:'Chaves nos cinco tipos e payload copia e cola com CRC16.'},{name:'Dados bancários',eng:'bancario',desc:'Banco, agência, conta e dígito verificador.'},{name:'Boletos',eng:'boleto',desc:'Linha digitável, código de barras, QR Code e dígitos verificadores sintéticos.',kw:'boleto linha digitavel codigo de barras qr code febraban'},{name:'Transações',soon:1,desc:'Respostas simuladas: aprovado, recusado, pendente, estornado.'}]},
{id:'estruturados',name:'Dados estruturados',icon:'code',desc:'JSON, XML, CSV, YAML, SQL, códigos, listas, hierarquias e séries.',count:'10 formatos · 1 tela',cards:[{name:'Dados estruturados',eng:'estrutura',desc:'Escolha o formato, as propriedades e a regra; o resultado aparece acima.',kw:'json xml csv yaml sql insert qr code codigo de barras ean lista hierarquia serie grafico'}]},
{id:'datas',name:'Datas e horários',icon:'cal',desc:'Datas, horários, timestamps, fusos, bissextos, datas inexistentes e fronteiras de intervalo.',count:'5 tipos · 1 tela',cards:[{name:'Datas e horários',eng:'data',desc:'Tipo, regra, formato, fuso e intervalo numa só tela.',kw:'data datas horário horarios hora timestamp unix fuso iso 8601 bissexto inexistente intervalo passada futura fronteira'}]},
{id:'borda',name:'Casos de borda',icon:'alert',direct:true,count:'8 tipos · 1 tela',desc:'Valores no limite das regras: comprimento, mínimo, máximo, nulos e extremos.',cards:['Comprimento máximo','Comprimento mínimo','Valor máximo','Valor mínimo','Nulo e vazio','Caracteres especiais','Valores extremos','Duplicidade'].map(n=>({name:n,eng:'borda',preset:{regra:n},desc:{'Comprimento máximo':'Strings com limite − 1, limite e limite + 1.','Comprimento mínimo':'Strings abaixo, no e acima do mínimo.','Valor máximo':'Números ao redor do máximo permitido.','Valor mínimo':'Números ao redor do mínimo permitido.','Nulo e vazio':'null, vazio, só espaços e quebras.','Caracteres especiais':'Injeção, HTML, Unicode e zero-width.','Valores extremos':'Limites de int32, float64, NaN e infinito.','Duplicidade':'Valores idênticos e quase idênticos.'}[n]}))},
{id:'mapas',name:'Mapas e coordenadas',icon:'pin',desc:'Pontos e áreas geográficas, em decimal, hemisfério ou graus, dentro ou fora do mapa.',count:'2 tipos · 1 tela',cards:[{name:'Mapas e coordenadas',eng:'mapa',desc:'Ponto ou área, região e formato. O link abre o mapa quando a coordenada cabe no globo.',kw:'mapa mapas coordenada coordenadas latitude longitude gps geolocalizacao bbox area ponto'}]},
{id:'combinadas',name:'Massa personalizada',icon:'layers',desc:'Defina as colunas e o tipo de valor de cada uma, e exporte quantos registros quiser em CSV ou JSON.',count:'34 tipos · 1 tela',cards:[{name:'Massa personalizada',eng:'combinadas',desc:'Escolha as colunas, o tipo e a regra de cada uma e a quantidade de registros. O preset Produtos monta um catálogo.',kw:'colunas csv json importação carga lote personalizada combinada planilha sku produto cor medida coordenada'}]}
];

export {
  TONE, EXP, rng, pick, int, slug, key, referenceLabel,
  ENG, genText, genStruct, FAM, INERT, REAL, FILE_DEF, FILE_FIELDS,
  fmtBytes, fileName, fileInfo, CS, DOC_FIELDS, DEFAULT_COMPS, PARA, LIST_ITEMS,
  CT, ctVal, person, CATS, cpfD, fmtCpf,
};

function colorRun(v, r) {
  const count = Math.max(1, Math.min(+v.qtd || 1, 1000))
  const paint = (row) => I(row.tag, row.tone, [['Valor', 'valor', row.value], ['Base', 'base', row.base], ['Regra aplicada', 'regra', row.why]], row.rule)
  const read = () => colorValue({
    representation: v.repr || 'HEX',
    origin: v.origemCor || 'Aleatória',
    baseText: String(v.corBase || ''),
    alpha: Number(v.alfa ?? 100),
    rule: v.regraCor || 'Válida',
    random: r,
  })
  const out = []
  for (let index = 0; index < count; index += 1) {
    const row = read()
    if (row.error) return [I('configuração incompatível', 'warn', [['Resultado', 'valor', '—'], ['Motivo', 'motivo', row.error]], 'incompativel')]
    out.push(paint(row))
  }
  return out
}

function measureRun(v, r) {
  const count = Math.max(1, Math.min(+v.qtd || 1, 1000))
  const read = () => measureValue({
    kind: v.tipo,
    unit: String(v.unidade || 'cm'),
    convertTo: String(v.converter || 'Não converter'),
    min: Number(v.min),
    max: Number(v.max),
    places: Number.parseInt(v.casas, 10) || 0,
    comma: v.sep !== 'Ponto',
    rule: v.regra || 'Aleatório no intervalo',
    random: r,
  })
  const paint = (row) => {
    const fields = [['Valor', 'valor', row.value], ['Unidade', 'unidade', row.unit], ['Regra aplicada', 'regra', row.why]]
    if (row.converted) fields.push(['Convertido', 'convertido', row.converted], ['Arredondamento', 'arredondamento', row.note])
    return I(row.tag, row.tone, fields, row.rule)
  }
  if (v.regra === 'Valores repetidos') {
    const row = read()
    if (row.error) return [I('configuração incompatível', 'warn', [['Resultado', 'valor', '—'], ['Motivo', 'motivo', row.error]], 'incompativel')]
    const item = paint(row)
    return Array.from({ length: Math.max(2, count) }, () => item)
  }
  const out = []
  for (let index = 0; index < count; index += 1) {
    const row = read()
    if (row.error) return [I('configuração incompatível', 'warn', [['Resultado', 'valor', '—'], ['Motivo', 'motivo', row.error]], 'incompativel')]
    out.push(paint(row))
  }
  return out
}
