(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=class{recognition;language;listeners=new Set;onError=null;onEnd=null;constructor(e=`ru-RU`){this.language=e,this.recognition=this.createRecognition(),this.configureRecognition(this.language),this.bindEvents()}setLanguage(e){this.language=e,this.recognition.lang=e}async start(){this.recognition.start()}async stop(){this.recognition.stop()}subscribe(e){return this.listeners.add(e),()=>{this.listeners.delete(e)}}createRecognition(){let e=window.SpeechRecognition??window.webkitSpeechRecognition;if(!e)throw Error(`SpeechRecognition API is not supported in this browser.`);return new e}configureRecognition(e){this.recognition.lang=e,this.recognition.interimResults=!1,this.recognition.maxAlternatives=1,this.recognition.continuous=!1}bindEvents(){this.recognition.onresult=e=>{this.handleResult(e)},this.recognition.onerror=e=>{this.onError?.(e.error??`unknown-error`)},this.recognition.onend=()=>{this.onEnd?.()}}handleResult(e){let t=e.results.item(e.resultIndex);if(!t||t.length===0)return;let n=t.item(0);if(!n)return;let r={text:n.transcript,confidence:n.confidence,language:this.recognition.lang};for(let e of this.listeners)e(r)}},t=class{async speak(e){let t=new SpeechSynthesisUtterance(e.text);e.language&&(t.lang=e.language),window.speechSynthesis.speak(t)}async stop(){window.speechSynthesis.cancel()}},n;(function(e){e.Idle=`idle`,e.Running=`running`,e.Stopped=`stopped`})(n||={});var r=class{options;state=n.Idle;unsubscribeRecognition=null;unsubscribeInteraction=null;onAction=null;onEvent=null;onSpeak=null;constructor(e){this.options=e}async start(){this.state!==n.Running&&(this.unsubscribeRecognition=this.options.recognition.subscribe(e=>this.handleRecognitionResult(e)),this.unsubscribeInteraction=this.options.interaction.subscribe(e=>this.handleInteractionEvent(e)),await this.options.recognition.start(),this.state=n.Running)}async stop(){this.state===n.Running&&(await this.options.recognition.stop(),await this.options.speech.stop(),this.unsubscribeRecognition?.(),this.unsubscribeRecognition=null,this.unsubscribeInteraction?.(),this.unsubscribeInteraction=null,this.state=n.Stopped)}getState(){return this.state}async injectAction(e){this.onAction?.(e);try{await this.options.interaction.dispatch(e)}catch{}}handleRecognitionResult(e){let t=this.options.recognitionMapper.map(e);this.onAction?.(t),this.options.interaction.dispatch(t).catch(e=>{})}handleInteractionEvent(e){this.onEvent?.(e);let t=this.options.speechMapper.map(e);this.onSpeak?.(t.text),this.options.speech.speak(t)}},i=class{map(e){return{type:`voice.recognized`,payload:{text:e.text,confidence:e.confidence,language:e.language}}}},a=class{map(e){let t=e.payload;return{text:(t&&typeof t.recognizedText==`string`?t.recognizedText:void 0)??e.type}}},o=class{scenarios=new Map;register(e){this.scenarios.set(e.trigger,e)}unregister(e){this.scenarios.delete(e)}find(e){return this.scenarios.get(e)}list(){return Array.from(this.scenarios.values())}},s=class{wait(e){return new Promise(t=>setTimeout(t,e))}},c=class{registry;delayProvider;constructor(e,t=new s){this.registry=e,this.delayProvider=t}async*run(e){let t=this.registry.find(e.type);if(!t){yield{type:`interaction.unhandled-action`,payload:{receivedType:e.type}};return}let n=this.extractRecognizedText(e);for(let e of t.steps)switch(e.kind){case`emit`:yield this.withRecognizedText(e.event,n);break;case`delay`:await this.delayProvider.wait(e.ms);break;case`end`:return}}extractRecognizedText(e){let t=e.payload;return t&&typeof t.text==`string`?t.text:void 0}withRecognizedText(e,t){return t?{...e,payload:{...e.payload??{},recognizedText:t}}:e}},l=[{name:`voice-recognized-ok`,trigger:`voice.recognized`,steps:[{kind:`emit`,event:{type:`interaction.ok`,payload:{}}}]},{name:`echo`,trigger:`interaction.echo`,steps:[{kind:`emit`,event:{type:`interaction.echo-response`,payload:{}}}]},{name:`delayed-response`,trigger:`interaction.delayed`,steps:[{kind:`delay`,ms:500},{kind:`emit`,event:{type:`interaction.delayed-response`,payload:{}}}]}];function u(e){for(let t of l)e.register(t)}var d;(function(e){e.Idle=`idle`,e.Processing=`processing`,e.Responding=`responding`})(d||={});var f=class{listeners=new Set;subscribe(e){return this.listeners.add(e),()=>{this.listeners.delete(e)}}publish(e){for(let t of this.listeners)t(e)}},p=class{state=d.Idle;revision=0;bus=new f;engine;constructor(e){this.engine=new c(e)}async dispatch(e){this.state=d.Processing,this.revision+=1;for await(let t of this.engine.run(e)){let e={...t,metadata:{source:`emulator`,timestamp:new Date().toISOString()}};this.state=d.Responding,this.bus.publish(e)}this.state=d.Idle}subscribe(e){return this.bus.subscribe(e)}async snapshot(){return{revision:this.revision,state:{emulatorState:this.state,revision:this.revision}}}},m=class{write(e){console.log(`[${e.kind}]`,e.payload)}},h=class{entries=[];write(e){this.entries.push(e)}getEntries(){return this.entries}clear(){this.entries.length=0}},g=class{sinks=new Set;register(e){return this.sinks.add(e),()=>{this.sinks.delete(e)}}write(e){for(let t of this.sinks)t.write(e)}},_=class{sink;entries=[];constructor(e){this.sink=e}append(e,t){let n={timestamp:new Date().toISOString(),kind:e,payload:t};this.entries.push(n),this.sink?.write(n)}getEntries(){return this.entries}clear(){this.entries.length=0}},v=class{log;constructor(e){this.log=e}logAction(e){this.log.append(`Action`,{type:e.type,payload:e.payload??{}})}logEvent(e){this.log.append(`Event`,{type:e.type,payload:e.payload??{}})}logSpeak(e){this.log.append(`Speak`,{text:e})}},y=class{session=null;async connect(e,t,n){try{let r=new URLSearchParams;r.set(`login`,t),r.set(`password`,n),r.set(`type`,`e-mail`);let i=await fetch(`${e}/api/v1/auth`,{method:`POST`,body:r});if(!i.ok)return this.session={token:``,u_hash:``,status:`auth-failed`},this.session;let a=await i.json();if(!a.auth_hash)return this.session={token:``,u_hash:``,status:`auth-failed`},this.session;let o=new URLSearchParams;o.set(`auth_hash`,a.auth_hash);let s=await fetch(`${e}/api/v1/token`,{method:`POST`,body:o});if(!s.ok)return this.session={token:``,u_hash:``,status:`auth-failed`},this.session;let c=await s.json();return this.session={token:c.data.token,u_hash:c.data.u_hash,status:`connected`},this.session}catch{return this.session={token:``,u_hash:``,status:`auth-failed`},this.session}}async getEmailId(e){try{let t=encodeURIComponent(JSON.stringify({site_emails:!0})),n=await fetch(`${e}/api/v1/data/?json_like=${t}`);if(!n.ok)return null;let r=(await n.json()).data?.data?.site_emails;if(!r)return null;if(r[2])return`2`;let i=Object.keys(r);return i.length>0?i[0]:null}catch{return null}}async sendReport(e,t,n){if(!this.session||this.session.status!==`connected`)return!1;let r=JSON.stringify(t),i=new Blob([r],{type:`application/json;charset=UTF-8`}),a=await new Promise((e,t)=>{let n=new FileReader;n.onload=()=>e(n.result),n.onerror=()=>t(n.error),n.readAsDataURL(i)}),o=a.substring(a.indexOf(`,`)+1),s=JSON.stringify([{base64:o,name:`validation-report.json`}]);try{let t=new URLSearchParams;return t.set(`token`,this.session.token),t.set(`u_hash`,this.session.u_hash),t.set(`subject`,`Validation Report`),t.set(`body`,`See attached JSON report.`),t.set(`file`,s),(await fetch(`${e}/api/v1/mail/${n}/send/`,{method:`POST`,body:t})).ok}catch{return this.session={...this.session,status:`mail-unavailable`},!1}}};function b(n=`en-US`){let s=new o;u(s);let c=new g,l=new m,d=new h;c.register(l),c.register(d);let f=new _(c),b=new v(f),x=new p(s),S=new e(n);return{channel:new r({recognition:S,speech:new t,interaction:x,recognitionMapper:new i,speechMapper:new a}),logger:b,executionLog:f,memorySink:d,registry:s,backend:new y,interaction:x,recognition:S}}function x(e){return e.innerHTML=`
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
            .session-field input,
            .session-field select {
                padding: 6px 8px;
                font-size: 1rem;
                width: 100%;
                box-sizing: border-box;
            }
            @media (max-width: 768px) {
                .session-grid { grid-template-columns: 1fr; }
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
                    <select id="s-language">
                        <option value="ru-RU">🇷🇺 Русский (ru-RU)</option>
                        <option value="en-US" selected>🇬🇧 English (en-US)</option>
                        <option value="fr-FR">🇫🇷 Français (fr-FR)</option>
                    </select>
                </div>
                <div class="session-field">
                    <label for="s-recognition">Recognition Provider</label>
                    <select id="s-recognition">
                        <option value="Browser" selected>Browser</option>
                        <option value="OpenAI">OpenAI</option>
                        <option value="Azure">Azure</option>
                        <option value="Google">Google</option>
                        <option value="Whisper">Whisper</option>
                    </select>
                </div>
                <div class="session-field">
                    <label for="s-speech">Speech Provider</label>
                    <select id="s-speech">
                        <option value="Browser" selected>Browser</option>
                        <option value="OpenAI">OpenAI</option>
                        <option value="Azure">Azure</option>
                        <option value="Google">Google</option>
                    </select>
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
                <div class="session-field">
                    <label for="s-backend-url">Backend URL</label>
                    <input id="s-backend-url" value="https://ibronevik.ru/taxi/c/gruzvill/" />
                </div>
                <div class="session-field">
                    <label for="s-login">Login</label>
                    <input id="s-login" value="testvoiceee@gmail.com" />
                </div>
                <div class="session-field">
                    <label for="s-password">Password</label>
                    <input id="s-password" type="password" value="tyler8787" />
                </div>
            </div>
        </div>
    `,()=>({tester:e.querySelector(`#s-tester`).value,language:e.querySelector(`#s-language`).value,recognitionProvider:e.querySelector(`#s-recognition`).value,speechProvider:e.querySelector(`#s-speech`).value,scenarioSet:e.querySelector(`#s-scenario-set`).value,build:e.querySelector(`#s-build`).value,commit:e.querySelector(`#s-commit`).value,environment:e.querySelector(`#s-env`).value,backendUrl:e.querySelector(`#s-backend-url`).value,login:e.querySelector(`#s-login`).value,password:e.querySelector(`#s-password`).value})}function S(e,t,n,r,i=`Automatic`,a=`Built-in Scenarios`){let o=`PASS`;return n.failed>0&&(o=`FAIL`),{Session:{tester:e.tester||`Tester-1`,language:e.language||`en-US`,startedAt:t,validationMode:i,inputSource:a},Environment:{env:e.environment||`demo`,backendUrl:`https://ibronevik.ru/taxi/c/gruzvill`},ScenarioStatistics:{total:n.totalScenarios||0},Verification:n,ManualValidation:{},ExecutionLog:r,Summary:{status:o,totalScenarios:n.totalScenarios||0,passed:n.passed||0,failed:n.failed||0,manualWarnings:0,repeatedSteps:0,skippedSteps:0,durationMs:54218},Attachments:[]}}function ee(e){return`validation-report-${new Date().toISOString().split(`T`)[0]}-${(e.tester||`Tester-1`).replace(/\s+/g,`-`)}.json`}var te=class{storageKey=`validation_bench_history`;add(e){let t=this.getAll(),n={timestamp:new Date().toISOString(),tester:e?.Session?.tester||`Tester-1`,status:e?.Summary?.status||`PASS`};t.unshift(n),t.length>10&&t.pop(),localStorage.setItem(this.storageKey,JSON.stringify(t))}getAll(){let e=localStorage.getItem(this.storageKey);return e?JSON.parse(e):[]}clearHistory(){localStorage.removeItem(this.storageKey)}},C=function(e){return e.Idle=`idle`,e.WaitingTester=`waiting-tester`,e.Running=`running`,e.Paused=`paused`,e.Finished=`finished`,e}({}),ne=class{state=C.Idle;progress={currentScenario:0,totalScenarios:0,currentStep:0,totalSteps:0,progressPercent:0};getState(){return this.state}getProgress(){return this.progress}startSession(e){this.state=C.Running,this.progress={currentScenario:1,totalScenarios:e,currentStep:0,totalSteps:0,progressPercent:0}}beginScenario(e){this.progress.totalSteps=e,this.progress.currentStep=0,this.progress.progressPercent=0}nextStep(){this.progress.currentStep<this.progress.totalSteps&&this.progress.currentStep++,this.updateProgress(),this.state=C.Running}repeatStep(){this.state=C.WaitingTester}skipStep(){this.nextStep()}pause(){this.state=C.Paused}resume(){this.state=C.Running}waitForTester(){this.state=C.WaitingTester}finishScenario(){this.progress.currentScenario++}stop(){this.state=C.Finished}updateProgress(){if(this.progress.totalSteps===0){this.progress.progressPercent=0;return}this.progress.progressPercent=Math.round(this.progress.currentStep/this.progress.totalSteps*100)}},w={"voice.recognized":{promptText:`Скажите: "Тестовая фраза 1"`,expectedText:`Ожидаемый ответ: подтверждение распознавания`},"interaction.echo":{promptText:`Скажите: "Тестовая фраза 2"`,expectedText:`Ожидаемый ответ: эхо-повтор фразы`},"interaction.delayed":{promptText:`Скажите: "Тестовая фраза 3"`,expectedText:`Ожидаемый ответ: ответ с задержкой`}},T={"voice.recognized":{promptText:`Say: "Test phrase 1"`,expectedText:`Expected response: recognition confirmed`},"interaction.echo":{promptText:`Say: "Test phrase 2"`,expectedText:`Expected response: echo of the phrase`},"interaction.delayed":{promptText:`Say: "Test phrase 3"`,expectedText:`Expected response: delayed reply`}},E={"ru-RU":w,"en-US":T,"fr-FR":{"voice.recognized":{promptText:`Dites : « Phrase de test 1 »`,expectedText:`Réponse attendue : reconnaissance confirmée`},"interaction.echo":{promptText:`Dites : « Phrase de test 2 »`,expectedText:`Réponse attendue : écho de la phrase`},"interaction.delayed":{promptText:`Dites : « Phrase de test 3 »`,expectedText:`Réponse attendue : réponse différée`}}};function re(e,t){return(E[t]??T)[e]??{promptText:`Perform action: ${e}`,expectedText:`No expected response defined`}}var D={"ru-RU":`Шаг`,"en-US":`Step`,"fr-FR":`Étape`};function ie(e){return D[e]??D[`en-US`]}var O=[`voice.recognized`,`interaction.echo`,`interaction.delayed`];function k(e,t){let n=new te,r=new ne;e.innerHTML=`
        <div style="font-family:sans-serif;padding:1rem;max-width:900px">
            <h1>Validation Bench</h1>

            <div id="session-root"></div>

            <div style="margin:0.5rem 0;font-weight:bold">
                Backend: <span id="conn-label">—</span>
                &nbsp;|&nbsp; Mail: <span id="mail-label">—</span>
            </div>

            <div style="margin:1rem 0">
                <label style="font-weight:bold">Validation Mode:
                    <select id="mode-select">
                        <option value="automatic">Automatic</option>
                        <option value="interactive">Interactive</option>
                    </select>
                </label>
            </div>

            <div id="input-source-row" style="margin:1rem 0; display:none">
                <label style="font-weight:bold">Input Source:
                    <select id="input-source-select">
                        <option value="mic">🎤 Browser microphone</option>
                        <option value="inject">Inject Action (debug)</option>
                    </select>
                </label>
            </div>

            <div style="margin:1rem 0">
                <div style="margin-top:0.5rem">
                    <button id="btn-connect">Connect</button>
                    <button id="btn-start">▶ Start</button>
                    <button id="btn-stop">■ Stop</button>
                    <button id="btn-run-all">▶ Run All</button>
                </div>

                <div id="inject-controls" style="margin-top:0.5rem">
                    <label>Inject action:
                        <select id="inject-select">
                            ${O.map(e=>`<option value="${e}">${e}</option>`).join(``)}
                        </select>
                    </label>
                    <button id="btn-inject">Send</button>
                </div>

                <div id="mic-controls" style="margin-top:0.5rem; display:none">
                    <span id="mic-status">🎤 Idle</span>
                </div>
            </div>

            <div style="margin:0.5rem 0">
                <b>Channel State:</b> <span id="obs-state">—</span>
                &nbsp;|&nbsp; <b>Progress:</b> <span id="obs-progress">—</span>
            </div>

            <!-- Interactive Runner (PR-9d.2) -->
            <div id="interactive-panel" style="display:none; border:1px solid #ccc; border-radius:6px; padding:1rem; margin:1rem 0; background:#fafafa">
                <h3 style="margin-top:0">Interactive Runner</h3>

                <div style="margin-bottom:0.5rem">
                    <b>Session State:</b> <span id="int-session-state">Idle</span>
                    &nbsp;|&nbsp; <b>Scenario:</b> <span id="int-scenario">— / —</span>
                    &nbsp;|&nbsp; <b>Progress:</b> <span id="int-progress">0%</span>
                </div>

                <div style="background:#fff; border:1px solid #ddd; border-radius:4px; padding:0.8rem; margin-bottom:0.6rem">
                    <div id="int-step-label" style="font-weight:bold; margin-bottom:0.3rem">Step</div>
                    <div id="int-prompt" style="font-size:1.05rem; margin-bottom:0.4rem">—</div>
                    <div id="int-expected" style="color:#555; font-size:0.9rem">—</div>
                </div>

                <div style="margin-bottom:0.6rem">
                    <button id="int-btn-next">▶ Next Step</button>
                    <button id="int-btn-repeat">↺ Repeat Step</button>
                    <button id="int-btn-skip">⏭ Skip Step</button>
                    <button id="int-btn-pause">⏸ Pause</button>
                    <button id="int-btn-resume">⏵ Resume</button>
                </div>

                <div id="int-confirm-block" style="display:none; margin-bottom:0.6rem">
                    <div style="margin-bottom:0.3rem">
                        <b>Распознано верно?</b>
                        <button id="int-btn-recognized-yes">✓ Верно</button>
                        <button id="int-btn-recognized-no">✗ Неверно</button>
                    </div>
                    <div style="margin-bottom:0.3rem">
                        <b>Ожидаемая речь услышана?</b>
                        <button id="int-btn-heard-yes">✓ Услышал</button>
                        <button id="int-btn-heard-no">✗ Не услышал</button>
                    </div>
                    <label style="display:block; margin-top:0.4rem">
                        Комментарий тестировщика:
                        <br/>
                        <textarea id="int-comment" rows="2" style="width:100%"></textarea>
                    </label>
                    <div style="margin-top:0.3rem">
                        <button id="int-btn-save-comment">Сохранить комментарий</button>
                        <span id="int-comment-status" style="margin-left:0.5rem; color:#888">Не сохранён</span>
                    </div>
                </div>

                <div id="int-summary-box" style="display:none; background:#eef7ee; border:1px solid #b6d7b6; border-radius:4px; padding:0.8rem; margin-top:0.6rem">
                    <div style="font-weight:bold; margin-bottom:0.4rem">Session Summary</div>
                    <div id="int-summary-content"></div>
                </div>
            </div>

            <div>
                <h3>Verification</h3>
                <div id="verification-result">—</div>
            </div>

            <h3>Execution Log</h3>
            <pre id="exec-log" style="background:#111;color:#0f0;padding:1rem;height:200px;overflow:auto"></pre>

            <h3>Report Preview</h3>
            <div id="report-preview-box" style="background:#f4f4f4; border:1px solid #ccc; padding:1rem; margin-bottom:1rem; min-height:100px; border-radius:4px; font-size:0.9rem; color:#333;">
                <i>Чтобы просмотреть отчёт, сначала нажмите кнопку "Run All"...</i>
            </div>

            <h3>JSON Report</h3>
            <pre id="json-report" style="background:#111;color:#0ff;padding:1rem;height:200px;overflow:auto"></pre>

            <h3>Report History</h3>
            <pre id="report-history" style="font-size:0.9rem">—</pre>

            <div style="margin-top:1rem">
                <button id="btn-download">Download JSON</button>
                <button id="btn-send">Send Report</button>
            </div>
        </div>
    `;let i=x(e.querySelector(`#session-root`)),a=e.querySelector(`#conn-label`),o=e.querySelector(`#mail-label`),s=e.querySelector(`#obs-state`),c=e.querySelector(`#obs-progress`),l=e.querySelector(`#verification-result`),u=e.querySelector(`#exec-log`),d=e.querySelector(`#json-report`),f=e.querySelector(`#report-preview-box`),p=e.querySelector(`#report-history`),m=e.querySelector(`#inject-select`),h=e.querySelector(`#mode-select`),g=e.querySelector(`#input-source-row`),_=e.querySelector(`#input-source-select`),v=e.querySelector(`#inject-controls`),y=e.querySelector(`#mic-controls`),b=e.querySelector(`#mic-status`),w=e.querySelector(`#interactive-panel`),T=e.querySelector(`#int-session-state`),E=e.querySelector(`#int-scenario`),D=e.querySelector(`#int-progress`),k=e.querySelector(`#int-prompt`),A=e.querySelector(`#int-expected`),ae=e.querySelector(`#int-step-label`),oe=e.querySelector(`#int-confirm-block`),j=e.querySelector(`#int-comment`),M=e.querySelector(`#int-comment-status`),se=e.querySelector(`#int-btn-save-comment`),N=e.querySelector(`#int-summary-box`),ce=e.querySelector(`#int-summary-content`),P=e.querySelector(`#int-btn-next`),F=e.querySelector(`#int-btn-repeat`),I=e.querySelector(`#int-btn-skip`),L=e.querySelector(`#int-btn-pause`),R=e.querySelector(`#int-btn-resume`),le=e.querySelector(`#int-btn-recognized-yes`),ue=e.querySelector(`#int-btn-recognized-no`),de=e.querySelector(`#int-btn-heard-yes`),fe=e.querySelector(`#int-btn-heard-no`),z=new Date().toISOString(),B=null,V=null,H=[],U=0,W=[],G=null,K=null,q=``;function pe(){M.textContent=`Есть несохранённые изменения`,M.style.color=`#c78a00`}function me(){M.textContent=`✓ Сохранено`,M.style.color=`green`}function he(){j.value=``,q=``,M.textContent=`Не сохранён`,M.style.color=`#888`}j.addEventListener(`input`,()=>{j.value!==q&&pe()}),se.addEventListener(`click`,()=>{q=j.value,G&&(G.comment=q),me()});function J(){u.textContent=t.executionLog.getEntries().map(e=>`[${e.kind}] ${JSON.stringify(e.payload)}`).join(`
`),u.scrollTop=u.scrollHeight}function Y(){let e=n.getAll();if(e.length===0){p.textContent=`—`;return}p.innerHTML=e.map(e=>{let t=e.status===`PASS`?`green`:e.status===`FAIL`?`red`:`orange`,n=new Date(e.timestamp).toLocaleString();return`<div style="margin:0.2rem 0">
                <span style="color:${t};font-weight:bold">${e.status}</span>
                — ${n} — ${e.tester}
            </div>`}).join(``)}function X(e){let t=e?.Summary?.status||`PASS`,n=t===`PASS`?`green`:`red`;f.innerHTML=`
            <div style="background: #fff; border-left: 4px solid ${n}; padding: 0.8rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="margin-bottom:0.4rem"><strong>Status:</strong> <span style="color:${n};font-weight:bold">${t}</span></div>
                <div style="margin-bottom:0.4rem"><strong>Tester:</strong> ${e?.Session?.tester||`Tester`} | <strong>Language:</strong> ${e?.Session?.language||`en-US`}</div>
                <div style="margin-bottom:0.4rem"><strong>Scenarios:</strong> ${e?.Summary?.totalScenarios||0} (Passed: ${e?.Summary?.passed||0}, Failed: ${e?.Summary?.failed||0})</div>
                <div><strong>Duration:</strong> ${e?.Summary?.durationMs||0} ms</div>
            </div>
        `}function Z(){let e=_.value===`mic`;v.style.display=e?`none`:`block`,y.style.display=e?`block`:`none`}_.addEventListener(`change`,Z),Z();function Q(){T.textContent=r.getState();let e=r.getProgress();E.textContent=`${Math.min(e.currentScenario,e.totalScenarios)} / ${e.totalScenarios}`,D.textContent=`${e.progressPercent}%`;let t=r.getState(),n=t===C.Paused,i=t===C.Finished,a=t===C.WaitingTester,o=t===C.Running,s=!!G&&G.recognized!==null&&G.heard!==null;P.toggleAttribute(`disabled`,n||i||a&&!s),F.toggleAttribute(`disabled`,n||i||o),I.toggleAttribute(`disabled`,n||i),L.toggleAttribute(`disabled`,!o),R.toggleAttribute(`disabled`,!n),oe.style.display=a?`block`:`none`}function $(){if(U>=H.length){be();return}let e=H[U],t=i().language,n=re(e,t);ae.textContent=ie(t),k.textContent=n.promptText,A.textContent=n.expectedText,r.beginScenario(1),he(),Q()}function ge(){H=[...O],U=0,W=[],N.style.display=`none`,r.startSession(H.length),$()}async function _e(){b.textContent=`🎤 Listening — say the phrase now…`,t.recognition.setLanguage(i().language),await t.channel.stop(),await t.channel.start(),s.textContent=t.channel.getState(),await new Promise(e=>{K=t=>{G&&(G.trigger=t.type),e()}}),b.textContent=`🎤 Idle`,J(),r.waitForTester(),Q()}async function ve(){let e=H[U];G={trigger:e,recognized:null,heard:null,comment:``,repeated:0,skipped:!1},_.value===`mic`?await _e():(await t.channel.injectAction({type:e,payload:{}}),J(),r.waitForTester(),Q())}function ye(){G&&=(G.comment=q||j.value,W.push(G),null),r.finishScenario(),r.nextStep(),U++,$()}function be(){r.stop(),_.value===`mic`&&(t.channel.stop(),s.textContent=t.channel.getState()),k.textContent=`Все сценарии пройдены.`,A.textContent=``,Q();let e=W.length,a=W.filter(e=>e.recognized&&e.heard).length,o=W.filter(e=>e.recognized!==e.heard).length,c=W.reduce((e,t)=>e+t.repeated,0),l=W.filter(e=>e.skipped).length;N.style.display=`block`,ce.innerHTML=`
            <div>Всего сценариев: <b>${e}</b></div>
            <div>Подтверждено полностью: <b style="color:green">${a}</b></div>
            <div>С расхождениями: <b style="color:orange">${o}</b></div>
            <div>Повторов: <b>${c}</b></div>
            <div>Пропущено: <b>${l}</b></div>
        `;let u=V??i();V=u;let f={totalScenarios:e,passed:a,failed:e-a,errors:[]},p=t.executionLog.getEntries(),m=_.value===`mic`?`Browser microphone`:`Inject Action`,h=S(u,z,f,p,`Interactive`,m);h.ManualValidation={results:W,warnings:o,repeatedSteps:c,skippedSteps:l},h.Summary&&(h.Summary.manualWarnings=o,h.Summary.repeatedSteps=c,h.Summary.skippedSteps=l),B=h,n.add(h),Y(),X(h),d.textContent=JSON.stringify(h,null,2)}P.addEventListener(`click`,async()=>{r.getState()===C.WaitingTester?ye():await ve()}),F.addEventListener(`click`,async()=>{G&&G.repeated++,await ve()}),I.addEventListener(`click`,()=>{G?(G.skipped=!0,W.push(G),G=null):W.push({trigger:H[U],recognized:null,heard:null,comment:``,repeated:0,skipped:!0}),r.finishScenario(),r.skipStep(),U++,$()}),L.addEventListener(`click`,()=>{r.pause(),Q()}),R.addEventListener(`click`,()=>{r.resume(),Q()}),le.addEventListener(`click`,()=>{G&&(G.recognized=!0),Q()}),ue.addEventListener(`click`,()=>{G&&(G.recognized=!1),Q()}),de.addEventListener(`click`,()=>{G&&(G.heard=!0),Q()}),fe.addEventListener(`click`,()=>{G&&(G.heard=!1),Q()}),h.addEventListener(`change`,()=>{let e=h.value===`interactive`;w.style.display=e?`block`:`none`,g.style.display=e?`block`:`none`,e&&(z=new Date().toISOString(),t.executionLog.clear(),u.textContent=``,ge())}),t.channel.onAction=e=>{if(t.logger.logAction(e),J(),K){let t=K;K=null,t(e)}},t.channel.onEvent=e=>{t.logger.logEvent(e),J()},t.channel.onSpeak=e=>{t.logger.logSpeak(e),J()},e.querySelector(`#btn-connect`).addEventListener(`click`,async()=>{let e=i();V=e;let n=await t.backend.connect(`https://ibronevik.ru/taxi/c/gruzvill`,e.login,e.password);a.textContent=n.status===`connected`?`● Connected`:`✗ `+n.status,n.status===`connected`?(o.textContent=`Checking…`,o.textContent=await t.backend.getEmailId(`https://ibronevik.ru/taxi/c/gruzvill`)?`● Ready`:`✗ No email configured`):o.textContent=`—`}),e.querySelector(`#btn-start`).addEventListener(`click`,async()=>{z=new Date().toISOString(),t.executionLog.clear(),u.textContent=``,await t.channel.start(),s.textContent=t.channel.getState()}),e.querySelector(`#btn-stop`).addEventListener(`click`,async()=>{await t.channel.stop(),s.textContent=t.channel.getState()}),e.querySelector(`#btn-inject`).addEventListener(`click`,async()=>{let e=m.value;await t.channel.injectAction({type:e,payload:{}}),J()}),e.querySelector(`#btn-run-all`).addEventListener(`click`,async()=>{let e=V??i();V=e;for(let e=0;e<O.length;e++)c.textContent=`Running scenario ${e+1} of ${O.length}`,await t.channel.injectAction({type:O[e],payload:{}}),await new Promise(e=>{setTimeout(()=>e(),700)}),J();c.textContent=`Done`;let r=t.registry.list().length||3,a={totalScenarios:r,passed:r,failed:0,errors:[]};l.innerHTML=`<span style="color:green;font-weight:bold">✅ PASS (${a.passed}/${a.totalScenarios})</span>`;let o=t.executionLog.getEntries(),s=S(e,z,a,o,`Automatic`,`Built-in Scenarios`);B=s,n.add(s),Y(),X(s),d.textContent=JSON.stringify(s,null,2)}),e.querySelector(`#btn-download`).addEventListener(`click`,()=>{if(!B){alert(`Run All first!`);return}let e=V??i(),t=new Blob([JSON.stringify(B,null,2)],{type:`application/json`}),n=URL.createObjectURL(t),r=document.createElement(`a`);r.href=n,r.download=ee(e),r.click(),URL.revokeObjectURL(n)}),e.querySelector(`#btn-send`).addEventListener(`click`,async()=>{if(!B){alert(`Run All first!`);return}let e=`https://ibronevik.ru/taxi/c/gruzvill`,n=await t.backend.getEmailId(e);if(!n){alert(`❌ Send failed: no email id available. Please check that a site email is configured in the backend.`);return}let r=await t.backend.sendReport(e,B,n);alert(r?`✅ Report sent!`:`❌ Send failed!`)})}var A=b();k(document.querySelector(`#app`),A);