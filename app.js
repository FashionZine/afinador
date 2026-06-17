const $=(q,c=document)=>c.querySelector(q); const $$=(q,c=document)=>[...c.querySelectorAll(q)];

let audioCtx;
let audioReady = false;
let clicks = true;
let selectedFreq = 329.63;
let refOsc = null;
let metroTimer = null;
let bpm = 96;
let masterGain, clickGain, refGain, metroGain;

function ensureAudio(){
  if(!audioCtx){
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(audioCtx.destination);

    clickGain = audioCtx.createGain();
    clickGain.gain.value = 0.08;
    clickGain.connect(masterGain);

    refGain = audioCtx.createGain();
    refGain.gain.value = 0.12;
    refGain.connect(masterGain);

    metroGain = audioCtx.createGain();
    metroGain.gain.value = 0.12;
    metroGain.connect(masterGain);
  }

  if(audioCtx.state === "suspended"){
    audioCtx.resume();
  }

  audioReady = true;
  const btn = $("#audioPrime");
  if(btn){
    btn.textContent = "Som ativado";
    btn.classList.add("ready");
  }
}

function unlockWithSilentPulse(){
  ensureAudio();

  // Pulso silencioso curto para desbloquear áudio em Safari/Chrome mobile.
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.frequency.value = 440;
  g.gain.value = 0.00001;
  o.connect(g).connect(masterGain);
  o.start();
  o.stop(audioCtx.currentTime + 0.025);
}

document.addEventListener("pointerdown", unlockWithSilentPulse, { once:true, passive:true });

function playTone(freq=760, duration=.075, gainNode=clickGain, type="sine", volume=.04){
  ensureAudio();

  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();

  o.type = type;
  o.frequency.setValueAtTime(freq, audioCtx.currentTime);

  g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(volume, audioCtx.currentTime + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

  o.connect(g).connect(gainNode);
  o.start(audioCtx.currentTime);
  o.stop(audioCtx.currentTime + duration + 0.01);
}

function tap(){
  if(!clicks) return;
  playTone(760,.07,clickGain,"sine",.04);
}

document.addEventListener("click",e=>{
  if(e.target.closest("button")) tap();
});

const audioPrime = $("#audioPrime");
if(audioPrime){
  audioPrime.addEventListener("click",()=>{
    unlockWithSilentPulse();
    playTone(880,.08,clickGain,"sine",.045);
  });
}

$$("[data-go]").forEach(b=>b.addEventListener("click",()=>{
  $$(".screen").forEach(s=>s.classList.remove("active"));
  $(`[data-screen="${b.dataset.go}"]`).classList.add("active");
}));

$("#soundToggle").addEventListener("click",()=>{
  ensureAudio();
  clicks=!clicks;
  $("#soundToggle").textContent=clicks?"♪":"×";
});

$$(".string").forEach(b=>b.addEventListener("click",()=>{
  ensureAudio();
  $$(".string").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  selectedFreq=Number(b.dataset.freq);
  $("#stringTitle").textContent=b.dataset.name;
  $("#stringFreq").textContent=selectedFreq.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+" Hz";
  $("#needle").style.left="50%";
  $("#status").textContent="Referência pronta";
}));

$("#refBtn").addEventListener("click",()=>{
  ensureAudio();

  if(refOsc){
    try{ refOsc.stop(); }catch(e){}
    refOsc=null;
    $("#refBtn").textContent="Tocar referência";
    return;
  }

  const o=audioCtx.createOscillator();
  const g=audioCtx.createGain();
  o.type="sine";
  o.frequency.value=selectedFreq;

  g.gain.setValueAtTime(0.0001,audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(.18,audioCtx.currentTime+.02);
  g.gain.setValueAtTime(.18,audioCtx.currentTime+.12);

  o.connect(g).connect(refGain);
  o.start(audioCtx.currentTime);
  refOsc=o;
  $("#refBtn").textContent="Parar referência";

  setTimeout(()=>{
    if(refOsc===o){
      g.gain.exponentialRampToValueAtTime(0.0001,audioCtx.currentTime+.08);
      setTimeout(()=>{
        try{o.stop()}catch(e){}
        if(refOsc===o) refOsc=null;
        $("#refBtn").textContent="Tocar referência";
      },100);
    }
  },1800);
});

function autoCorrelate(buf, sampleRate){
  let size=buf.length, rms=0;
  for(let i=0;i<size;i++) rms+=buf[i]*buf[i];
  rms=Math.sqrt(rms/size);
  if(rms<.01) return -1;

  let r1=0,r2=size-1,thres=.2;
  for(let i=0;i<size/2;i++) if(Math.abs(buf[i])<thres){r1=i;break;}
  for(let i=1;i<size/2;i++) if(Math.abs(buf[size-i])<thres){r2=size-i;break;}

  buf=buf.slice(r1,r2);
  size=buf.length;
  let c=new Array(size).fill(0);
  for(let i=0;i<size;i++){
    for(let j=0;j<size-i;j++) c[i]+=buf[j]*buf[j+i];
  }

  let d=0;
  while(c[d]>c[d+1]) d++;

  let max=-1,pos=-1;
  for(let i=d;i<size;i++){
    if(c[i]>max){max=c[i];pos=i;}
  }
  return sampleRate/pos;
}

$("#micBtn").addEventListener("click",async()=>{
  ensureAudio();

  try{
    const stream=await navigator.mediaDevices.getUserMedia({
      audio:{
        echoCancellation:false,
        noiseSuppression:false,
        autoGainControl:false
      }
    });

    const source=audioCtx.createMediaStreamSource(stream);
    const analyser=audioCtx.createAnalyser();
    analyser.fftSize=2048;
    source.connect(analyser);

    const buf=new Float32Array(analyser.fftSize);
    $("#micBtn").textContent="Microfone ativo";
    $("#status").textContent="Toque uma corda";

    function tick(){
      analyser.getFloatTimeDomainData(buf);
      const freq=autoCorrelate(buf,audioCtx.sampleRate);

      if(freq>0){
        const cents=1200*Math.log2(freq/selectedFreq);
        const clamp=Math.max(-50,Math.min(50,cents));
        $("#needle").style.left=(50+clamp)+"%";

        $("#status").textContent =
          Math.abs(cents)<6 ? "Afinado" :
          cents<0 ? "Aperte a corda" :
          "Afrouxe a corda";
      }

      requestAnimationFrame(tick);
    }
    tick();
  }catch(e){
    $("#status").textContent="Microfone bloqueado";
  }
});

const scales={
  cmajor:["C","D","E","F","G","A","B","C"],
  gmajor:["G","A","B","C","D","E","F#","G"],
  aminor:["A","B","C","D","E","F","G","A"],
  eminor:["E","F#","G","A","B","C","D","E"]
};

const ymap={C:170,D:155,E:140,F:125,G:110,A:95,B:80,"F#":125};

function drawScore(k){
  const svg=$("#score"), notes=scales[k];
  svg.innerHTML="";

  for(let i=0;i<5;i++){
    svg.innerHTML+=`<line x1="30" y1="${70+i*28}" x2="690" y2="${70+i*28}" stroke="white" stroke-opacity=".72" stroke-width="2"/>`;
  }

  notes.forEach((n,i)=>{
    const x=70+i*82;
    const y=ymap[n]||ymap[n.replace("#","")]||120;

    svg.innerHTML+=`
      <ellipse cx="${x}" cy="${y}" rx="18" ry="13" fill="white" transform="rotate(-12 ${x} ${y})">
        <animate attributeName="cy" values="${y};${y-5};${y}" dur="${2+i*.12}s" repeatCount="indefinite"/>
      </ellipse>
      <line x1="${x+16}" y1="${y}" x2="${x+16}" y2="${y-72}" stroke="white" stroke-width="3"/>
    `;

    if(n.includes("#")){
      svg.innerHTML+=`<text x="${x-34}" y="${y+8}" fill="white" opacity=".7" font-size="28" font-weight="700">#</text>`;
    }

    svg.innerHTML+=`<text x="${x-13}" y="225" fill="white" opacity=".62" font-size="18">${n}</text>`;
  });
}

drawScore("cmajor");

$$(".choice").forEach(b=>b.addEventListener("click",()=>{
  $$(".choice").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  $("#scaleTitle").textContent=b.textContent;
  drawScore(b.dataset.scale);
}));

function metroClick(){
  ensureAudio();
  playTone(1040,.055,metroGain,"square",.09);
  $("#orb").classList.add("hit");
  setTimeout(()=>$("#orb").classList.remove("hit"),120);
}

function update(v){
  bpm=Math.max(40,Math.min(220,Number(v)));
  $("#bpm").textContent=bpm;
  $("#range").value=bpm;

  if(metroTimer){
    clearInterval(metroTimer);
    metroTimer=setInterval(metroClick,60000/bpm);
  }
}

$("#range").addEventListener("input",e=>update(e.target.value));
$("#up").addEventListener("click",()=>update(bpm+1));
$("#down").addEventListener("click",()=>update(bpm-1));

$("#metroToggle").addEventListener("click",()=>{
  ensureAudio();

  if(metroTimer){
    clearInterval(metroTimer);
    metroTimer=null;
    $("#metroToggle").textContent="Iniciar";
  }else{
    metroClick();
    metroTimer=setInterval(metroClick,60000/bpm);
    $("#metroToggle").textContent="Parar";
  }
});
