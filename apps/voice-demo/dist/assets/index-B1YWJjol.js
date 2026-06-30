(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=class{recognition;listeners=new Set;constructor(e=`ru-RU`){this.recognition=this.createRecognition(),this.configureRecognition(e),this.bindEvents()}async start(){this.recognition.start()}async stop(){this.recognition.stop()}subscribe(e){return this.listeners.add(e),()=>{this.listeners.delete(e)}}createRecognition(){let e=window.SpeechRecognition??window.webkitSpeechRecognition;if(!e)throw Error(`SpeechRecognition API is not supported in this browser.`);return new e}configureRecognition(e){this.recognition.lang=e,this.recognition.interimResults=!1,this.recognition.maxAlternatives=1,this.recognition.continuous=!1}bindEvents(){this.recognition.onresult=e=>{this.handleResult(e)},this.recognition.onerror=()=>{}}handleResult(e){let t=e.results.item(e.resultIndex);if(!t||t.length===0)return;let n=t.item(0);if(!n)return;let r={text:n.transcript,confidence:n.confidence,language:this.recognition.lang};for(let e of this.listeners)e(r)}},t=class{async speak(e){let t=new SpeechSynthesisUtterance(e.text);e.language&&(t.lang=e.language),window.speechSynthesis.speak(t)}async stop(){window.speechSynthesis.cancel()}},n;(function(e){e.Idle=`idle`,e.Running=`running`,e.Stopped=`stopped`})(n||={});var r=class{options;state=n.Idle;unsubscribeRecognition=null;unsubscribeInteraction=null;onAction=null;onEvent=null;onSpeak=null;constructor(e){this.options=e}async start(){this.state!==n.Running&&(this.unsubscribeRecognition=this.options.recognition.subscribe(e=>this.handleRecognitionResult(e)),this.unsubscribeInteraction=this.options.interaction.subscribe(e=>this.handleInteractionEvent(e)),await this.options.recognition.start(),this.state=n.Running)}async stop(){this.state===n.Running&&(await this.options.recognition.stop(),await this.options.speech.stop(),this.unsubscribeRecognition?.(),this.unsubscribeRecognition=null,this.unsubscribeInteraction?.(),this.unsubscribeInteraction=null,this.state=n.Stopped)}getState(){return this.state}async injectAction(e){this.onAction?.(e);try{await this.options.interaction.dispatch(e)}catch{}}handleRecognitionResult(e){let t=this.options.recognitionMapper.map(e);this.onAction?.(t),this.options.interaction.dispatch(t).catch(e=>{})}handleInteractionEvent(e){this.onEvent?.(e);let t=this.options.speechMapper.map(e);this.onSpeak?.(t.text),this.options.speech.speak(t)}},i=class{map(e){return{type:`voice.recognized`,payload:{text:e.text,confidence:e.confidence,language:e.language}}}},a=class{map(e){return{text:e.type}}},o=class{scenarios=new Map;register(e){this.scenarios.set(e.trigger,e)}unregister(e){this.scenarios.delete(e)}find(e){return this.scenarios.get(e)}list(){return Array.from(this.scenarios.values())}},s=class{wait(e){return new Promise(t=>setTimeout(t,e))}},c=class{registry;delayProvider;constructor(e,t=new s){this.registry=e,this.delayProvider=t}async*run(e){let t=this.registry.find(e.type);if(!t){yield{type:`interaction.unhandled-action`,payload:{receivedType:e.type}};return}for(let e of t.steps)switch(e.kind){case`emit`:yield e.event;break;case`delay`:await this.delayProvider.wait(e.ms);break;case`end`:return}}},l=[{name:`voice-recognized-ok`,trigger:`voice.recognized`,steps:[{kind:`emit`,event:{type:`interaction.ok`,payload:{}}}]},{name:`echo`,trigger:`interaction.echo`,steps:[{kind:`emit`,event:{type:`interaction.echo-response`,payload:{}}}]},{name:`delayed-response`,trigger:`interaction.delayed`,steps:[{kind:`delay`,ms:500},{kind:`emit`,event:{type:`interaction.delayed-response`,payload:{}}}]}];function u(e){for(let t of l)e.register(t)}var d;(function(e){e.Idle=`idle`,e.Processing=`processing`,e.Responding=`responding`})(d||={});var f=class{listeners=new Set;subscribe(e){return this.listeners.add(e),()=>{this.listeners.delete(e)}}publish(e){for(let t of this.listeners)t(e)}},p=class{state=d.Idle;revision=0;bus=new f;engine;constructor(e){this.engine=new c(e)}async dispatch(e){this.state=d.Processing,this.revision+=1;for await(let t of this.engine.run(e)){let e={...t,metadata:{source:`emulator`,timestamp:new Date().toISOString()}};this.state=d.Responding,this.bus.publish(e)}this.state=d.Idle}subscribe(e){return this.bus.subscribe(e)}async snapshot(){return{revision:this.revision,state:{emulatorState:this.state,revision:this.revision}}}},m=class{write(e){console.log(`[${e.kind}]`,e.payload)}},h=class{entries=[];write(e){this.entries.push(e)}getEntries(){return this.entries}clear(){this.entries.length=0}},g=class{sinks=new Set;register(e){return this.sinks.add(e),()=>{this.sinks.delete(e)}}write(e){for(let t of this.sinks)t.write(e)}},_=class{sink;entries=[];constructor(e){this.sink=e}append(e,t){let n={timestamp:new Date().toISOString(),kind:e,payload:t};this.entries.push(n),this.sink?.write(n)}getEntries(){return this.entries}clear(){this.entries.length=0}},v=class{log;constructor(e){this.log=e}logAction(e){this.log.append(`Action`,{type:e.type})}logEvent(e){this.log.append(`Event`,{type:e.type})}logSpeak(e){this.log.append(`Speak`,{text:e})}},y=class{session=null;async connect(e,t,n){try{let r=await fetch(`${e}/api/v1/auth/`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({login:t,password:n,type:`e-mail`})});if(!r.ok)return this.session={token:``,u_hash:``,status:`auth-failed`},this.session;let i=await r.json();return this.session={token:i.token,u_hash:i.u_hash,status:`connected`},this.session}catch{return this.session={token:``,u_hash:``,status:`auth-failed`},this.session}}async sendReport(e,t,n){if(!this.session||this.session.status!==`connected`)return!1;let r=JSON.stringify(t),i=btoa(unescape(encodeURIComponent(r)));try{return(await fetch(`${e}/api/v1/mail/`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({token:this.session.token,u_hash:this.session.u_hash,subject:`Validation Report`,body:`See attached JSON report.`,file:i,e_id:n})})).ok}catch{return this.session={...this.session,status:`mail-unavailable`},!1}}};function b(n=`en-US`){let s=new o;u(s);let c=new g,l=new m,d=new h;c.register(l),c.register(d);let f=new _(c),b=new v(f),x=new p(s);return{channel:new r({recognition:new e(n),speech:new t,interaction:x,recognitionMapper:new i,speechMapper:new a}),logger:b,executionLog:f,memorySink:d,registry:s,backend:new y,interaction:x}}function x(e){return e.innerHTML=`
        <style>
            .session-panel { margin-bottom: 1rem; }
            .session-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(220px, 1fr));
                gap: 12px 16px;
                margin-top: 0.5rem;
            }
            .session-field {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .session-field label {
                font-size: 0.85rem;
                font-weight: 600;
            }
            .session-field input {
                padding: 6px 8px;
                font-size: 1rem;
                width: 100%;
                box-sizing: border-box;
            }
            @media (max-width: 768px) {
                .session-grid {
                    grid-template-columns: 1fr;
                }
            }
        </style>
        <div class="session-panel">
            <h2>Test Session</h2>
            <div class="session-grid">
                <div class="session-field">
                    <label for="s-tester">Tester</label>
                    <input id="s-tester" value="Tester-1" />
                </div>
                <div class="session-field">
                    <label for="s-language">Language</label>
                    <input id="s-language" value="ru-RU" />
                </div>
                <div class="session-field">
                    <label for="s-recognition">Recognition Provider</label>
                    <input id="s-recognition" value="Browser" />
                </div>
                <div class="session-field">
                    <label for="s-speech">Speech Provider</label>
                    <input id="s-speech" value="Browser" />
                </div>
                <div class="session-field">
                    <label for="s-scenario-set">Scenario Set</label>
                    <input id="s-scenario-set" value="builtin" />
                </div>
                <div class="session-field">
                    <label for="s-build">Build</label>
                    <input id="s-build" value="1.0.0" />
                </div>
                <div class="session-field">
                    <label for="s-commit">Commit</label>
                    <input id="s-commit" value="bafc789" />
                </div>
                <div class="session-field">
                    <label for="s-env">Environment</label>
                    <input id="s-env" value="demo" />
                </div>
            </div>
        </div>
    `,()=>({tester:e.querySelector(`#s-tester`).value,language:e.querySelector(`#s-language`).value,recognitionProvider:e.querySelector(`#s-recognition`).value,speechProvider:e.querySelector(`#s-speech`).value,scenarioSet:e.querySelector(`#s-scenario-set`).value,build:e.querySelector(`#s-build`).value,commit:e.querySelector(`#s-commit`).value,environment:e.querySelector(`#s-env`).value})}function S(){let e=navigator.userAgent;return{browser:e,operatingSystem:C(e)}}function C(e){return e.includes(`Windows`)?`Windows`:e.includes(`Mac OS`)?`macOS`:e.includes(`Android`)?`Android`:e.includes(`iPhone`)||e.includes(`iPad`)?`iOS`:e.includes(`Linux`)?`Linux`:`Unknown`}function w(e,t,n,r){let i=new Date().toISOString(),{browser:a,operatingSystem:o}=S();return{tester:e.tester,language:e.language,build:e.build,commit:e.commit,browser:a,operatingSystem:o,scenarioSet:e.scenarioSet,environment:e.environment,startedAt:t,finishedAt:i,durationMs:Date.now()-new Date(t).getTime(),verification:n,executionLog:r}}var T=class{log;constructor(e){this.log=e}verify(e){let t=[],n=this.log.getEntries(),r=0,i=null,a=null;for(let o=0;o<e.expectations.length;o++){let s=e.expectations[o],c=this.findNextMatch(n,r,s);if(c===-1){s.optional||t.push({message:`Expected entry of kind "${s.kind}" not found`,expected:s,index:o});continue}let l=n[c];i||=l.timestamp,a=l.timestamp,s.payload!==void 0&&!this.payloadMatches(l.payload,s.payload)&&t.push({message:`Payload mismatch for kind "${s.kind}"`,expected:s.payload,actual:l.payload,index:o}),r=c+1}let o=i&&a?new Date(a).getTime()-new Date(i).getTime():0;return{scenario:e,passed:t.length===0,durationMs:o,errors:t}}payloadMatches(e,t){if(typeof t!=`object`||!t)return e===t;if(typeof e!=`object`||!e)return!1;let n=t,r=e;return Object.keys(n).every(e=>JSON.stringify(r[e])===JSON.stringify(n[e]))}findNextMatch(e,t,n){for(let r=t;r<e.length;r++)if(e[r].kind===n.kind)return r;return-1}},E=class{verifier;constructor(e){this.verifier=new T(e)}runOne(e){return this.verifier.verify(e)}runMany(e){let t=e.map(e=>this.verifier.verify(e));return this.buildReport(t)}runAll(e){return this.runMany(e)}buildReport(e){return{totalScenarios:e.length,passed:e.filter(e=>e.passed).length,failed:e.filter(e=>!e.passed).length,results:e,errors:e.flatMap(e=>e.errors.map(e=>e.message)),totalDurationMs:e.reduce((e,t)=>e+t.durationMs,0)}}},D=[`voice.recognized`,`interaction.echo`,`interaction.delayed`];function O(e,t){e.innerHTML=`
        <div style="font-family:sans-serif;padding:1rem;max-width:900px">
            <h1>Validation Bench</h1>

            <div id="session-root"></div>

            <div style="margin:0.5rem 0;font-weight:bold">
                Backend: <span id="conn-label">—</span>
                &nbsp;|&nbsp; Mail: <span id="mail-label">—</span>
            </div>

            <div style="margin:1rem 0">
                <div style="margin-top:0.5rem">
                    <button id="btn-connect">Connect</button>
                    <button id="btn-start">▶ Start</button>
                    <button id="btn-stop">■ Stop</button>
                    <button id="btn-run-all">▶ Run All</button>
                </div>
                <div style="margin-top:0.5rem">
                    <label>Inject action:
                        <select id="inject-select">
                            ${D.map(e=>`<option value="${e}">${e}</option>`).join(``)}
                        </select>
                    </label>
                    <button id="btn-inject">Send</button>
                </div>
            </div>

            <div style="margin:0.5rem 0">
                <b>Channel State:</b> <span id="obs-state">—</span>
                &nbsp;|&nbsp; <b>Progress:</b> <span id="obs-progress">—</span>
            </div>

            <div>
                <h3>Verification</h3>
                <div id="verification-result">—</div>
            </div>

            <h3>Execution Log</h3>
            <pre id="exec-log" style="background:#111;color:#0f0;padding:1rem;height:200px;overflow:auto"></pre>

            <h3>JSON Report</h3>
            <pre id="json-report" style="background:#111;color:#0ff;padding:1rem;height:200px;overflow:auto"></pre>

            <div style="margin-top:1rem">
                <button id="btn-download">Download JSON</button>
                <button id="btn-send">Send Report</button>
            </div>
        </div>
    `;let n=x(e.querySelector(`#session-root`)),r=e.querySelector(`#conn-label`),i=e.querySelector(`#mail-label`),a=e.querySelector(`#obs-state`),o=e.querySelector(`#obs-progress`),s=e.querySelector(`#verification-result`),c=e.querySelector(`#exec-log`),l=e.querySelector(`#json-report`),u=e.querySelector(`#inject-select`),d=new Date().toISOString(),f=null,p=null;function m(){c.textContent=t.executionLog.getEntries().map(e=>`[${e.kind}] ${JSON.stringify(e.payload)}`).join(`
`),c.scrollTop=c.scrollHeight}t.channel.onAction=e=>{t.logger.logAction(e),m()},t.channel.onEvent=e=>{t.logger.logEvent(e),m()},t.channel.onSpeak=e=>{t.logger.logSpeak(e),m()},e.querySelector(`#btn-connect`).addEventListener(`click`,async()=>{p=n();let e=await t.backend.connect(`https://your-backend.example.com`,`voice.test`,`test-password`);r.textContent=e.status===`connected`?`● Connected`:`✗ `+e.status,i.textContent=e.status===`connected`?`Ready`:`—`}),e.querySelector(`#btn-start`).addEventListener(`click`,async()=>{d=new Date().toISOString(),t.executionLog.clear(),c.textContent=``,await t.channel.start(),a.textContent=t.channel.getState()}),e.querySelector(`#btn-stop`).addEventListener(`click`,async()=>{await t.channel.stop(),a.textContent=t.channel.getState()}),e.querySelector(`#btn-inject`).addEventListener(`click`,async()=>{let e=u.value;await t.channel.injectAction({type:e,payload:{}}),m()}),e.querySelector(`#btn-run-all`).addEventListener(`click`,async()=>{let e=p??n();o.textContent=`Running scenario 1 of 3`;for(let e=0;e<D.length;e++)o.textContent=`Running scenario ${e+1} of ${D.length}`,await t.channel.injectAction({type:D[e],payload:{}}),await new Promise(e=>setTimeout(e,700)),m();o.textContent=`Done`;let r=new E(t.executionLog),i=t.registry.list().map(e=>{let t=e.trigger,n=e.steps.filter(e=>e.kind===`emit`),r=[{kind:`Action`,payload:{type:t},optional:!1},...n.flatMap(e=>[{kind:`Event`,payload:{type:e.event.type},optional:!1},{kind:`Speak`,optional:!1}])];return{id:e.name,name:e.name,expectations:r}}),a=r.runAll(i);s.innerHTML=a.failed===0?`<span style="color:green">✅ PASS (${a.passed}/${a.totalScenarios})</span>`:`<span style="color:red">❌ FAIL (${a.failed} errors)</span><br>${a.errors.map(e=>`• ${e}`).join(`<br>`)}`;let c=t.executionLog.getEntries(),u=w(e,d,a,c);f=u,l.textContent=JSON.stringify(u,null,2)}),e.querySelector(`#btn-download`).addEventListener(`click`,()=>{if(!f){alert(`Run All first!`);return}let e=new Blob([JSON.stringify(f,null,2)],{type:`application/json`}),t=URL.createObjectURL(e),n=document.createElement(`a`);n.href=t,n.download=`validation-report.json`,n.click(),URL.revokeObjectURL(t)}),e.querySelector(`#btn-send`).addEventListener(`click`,async()=>{if(!f){alert(`Run All first!`);return}let e=await t.backend.sendReport(`https://your-backend.example.com`,f,`e_id_placeholder`);alert(e?`✅ Report sent!`:`❌ Send failed!`)})}var k=b();O(document.querySelector(`#app`),k);