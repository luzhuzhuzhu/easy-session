# ES-as-DSH-Plugin 鏋勫缓绗旇锛坓oal-b2526dcf锛?
> 鍚屼竴浼氳瘽鍚庣画杞鐨勬寔涔呰蹇嗐€備袱涓粨搴?+ 涓€涓?profile 鐩綍銆?
## 鐩爣锛堢敤鎴峰凡鎷嶆澘锛?
- 褰㈡€侊細**浠撳簱绾ф彃浠跺寘**锛堟寔涔咃級锛岃惤鍦?D:\deepseek-harness monorepo
- 鑼冨洿棣栫増锛?*瀹屾暣缁堢浜や簰鐗?* 鈥斺€?浼氳瘽鏍?+ 瀹炴椂杈撳嚭 + 杈撳叆/resize + 鍚姩/鏆傚仠/閲嶅惎
- 寮曟搸锛?*DSH 鎷夎捣 ES 寮曟搸**锛堢粰 EasySession 鍔?headless 鏀寔锛屾敼鍔ㄦ渶灏忥級
- 鐢ㄦ埛寮鸿皟锛氭棩甯镐範鎯湪**妗岄潰瀹㈡埛绔?GUI 缁堢椤甸潰**锛圫essionsView 浼氳瘽鏍?+ TerminalOutput锛夛紝ES web 鐗堜綋楠屽樊 鈫?UI 鍦?DSH GUI 澶嶅埢妗岄潰缁堢椤典氦浜掞紝涓嶅€?ES 缃戦〉娓叉煋

## 鍏抽敭鏋舵瀯浜嬪疄

### EasySession锛圖:\EasySession锛宔lectron-vite+Vue3锛?.8.0锛?- 鏍稿績锛歯ode-pty 璧?claude/codex/opencode CLI 涓?shell 浼氳瘽锛沗src/main/services/cli-manager.ts`锛坰pawn/write/onExit锛夈€乣terminal-adapter.ts`锛坰hell 浼氳瘽锛歴pawn shell + 绛夋彁绀虹鍚庨摼寮忔敞鍏?startupCommands锛夈€乤dapters锛坈laude/codex/opencode锛夈€乻ession-output锛堝綊妗?鍘嗗彶锛夈€乤gent-bus锛坋s CLI named-pipe 鍝戜腑缁?+ task-store 浠诲姟鐘舵€佹満锛夈€乸roject/skill 浣撶郴
- **remote 鏈嶅姟鏄閮ㄩ┍鍔ㄩ棬**锛歟xpress + socket.io锛?27.0.0.1:18765锛圖EFAULT_REMOTE_PORT锛?  - REST 璺敱锛坰rc/main/remote/routes.ts锛夛細projects CRUD銆乻essions 鍒楄〃/鍒涘缓/鍚姩/鏆傚仠/閲嶅惎/閿€姣併€佽緭鍑哄巻鍙层€佽兘鍔涘０鏄庯紙capabilities.ts锛夈€?login銆?sessions 椤点€乺emote-assets/xterm.js锛坵eb 鐗堣嚜鐢級
  - socket 鍗忚锛坰rc/main/remote/socket.ts锛夛細
    - `subscribe {sessionId, historyLines?}` 鈫?鍏堝洖鏀惧巻鍙诧紙session:output {sessionId,data,stream,timestamp,seq}锛夊啀鍙?session:status锛沯oin `session:<id>` room
    - `unsubscribe`銆乣input {sessionId,input}`锛堣嚜鍔ㄨˉ `\r`锛夈€乣write {sessionId,data}`锛堝師鏍?PTY 鍐欙紝鏃?CR 杩藉姞锛?    - `resize`锛圫essionResizePayload锛宲ty resize锛?    - 鍓嶇疆鏉′欢锛?*蹇呴』鍏?subscribe 鎵嶈兘 input/write/resize**锛坋nsureJoined锛?    - 閴存潈锛歵oken锛坅uth.ts锛夛紱鎴块棿/鑳藉姏琛ㄨ RemoteCapabilityMap
  - 榛樿 `passthroughOnly: true`锛坉efaults.ts锛夆啋 **杩滅▼榛樿涓嶅厑璁哥敓鍛藉懆鏈熸搷浣?*锛坈reate/start/pause/restart/destroy锛夛紝鍙厑璁稿杩愯涓細璇濆啓鍏ワ紱瑕佸叏鐢熷懡鍛ㄦ湡闇€鍦?ES 鎵撳紑锛坮emote-service-config.json / env overrides / tokenSource env|custom|file|generated锛宼oken 鏂囦欢榛樿 remote-token.txt锛?  - idleTimeoutMs 30min 绌洪棽鏂紑
- 鏃?headless 妯″紡锛坢ain/index.ts 鏃犵浉鍏冲垎鏀級鈫?**闇€鍔?*锛氬 `--headless` argv 鎴?env锛岃烦杩?BrowserWindow锛屼繚鐣?services + remote
- es CLI锛氭敞鍏ュ紡鍝戝鎴风锛圗LECTRON_RUN_AS_NODE + net pipe锛夛紝bus 鍦?main 杩涚▼鍐呰В鏋愬懡浠わ紙sessions/send/recv/peek/task create|accept|start|progress|block|unblock|done|fail|confirm/list/show锛?- renderer 缁堢椤垫瀯鎴愶細SessionsView + SessionSidebarTree/SessionTopList/SessionActionLayer/SessionRuntimeInfo/TerminalOutput/CreateSessionDialog锛汣ollaborationView锛坋s task 闈㈡澘锛?- 璇█瑕佹眰锛氫腑鏂囨敞閲婏紱**缁濅笉杩愯 npm run build / 鍏ㄩ噺娴嬭瘯**锛圕LAUDE.md锛?
### DSH锛圖:\deepseek-harness锛宲npm monorepo锛?- 浜х墿鍒嗗眰锛?  - Host 鑳藉姏 = monorepo packages锛園deepseek-ai/dsh-*锛夛紝缁勫悎琛屾寕鍦?profile composition锛坧atch 鏈哄埗锛宺ow id 瀵诲潃銆佸悗鑰呰鐩栧墠鑰咃級
  - Web Client 鎻掍欢 = packages 閲?package.json 澹版槑 `dsh.client {inject[], platform:"web"}` + exports "./client" 鐨勫寘锛堝 @deepseek-ai/dsh-client-ui-subagent锛夛紱lib/ 鐢?tsdown 浜у嚭锛沜lientModules 澧為噺鎵弿瑁呰浇杩?__DSH_BOOT__锛沗pnpm dev:web`锛坰cripts/dev-web.ts锛墂atch client 鍖?  - preset = cordis 缁勫悎鐩綍锛坰hipped 鍦?packages/preset/agent-presets/presets/<id>锛岀鍐欙紱鐢ㄦ埛 preset 鍦?$DSH_HOME/.agent-presets/<id>/锛?- 鏈満閮ㄧ讲锛欴SH_HOME=C:\Users\15479\.dsh锛?*profile 鍦?C:\Users\15479\.dsh\profiles\web\**
  - cordis.yml = `[]`锛堟牴涓虹┖锛岄潬 patches 缁勫悎锛?  - **鐢ㄦ埛琛ヤ竵灞?C:\Users\15479\.dsh\profiles\web\cordis.patch.yml = 鎴戜滑鎻?host 琛岀殑鍦版柟**锛堢幇鍦?`[]`锛屾敞閲婏細top-level array of loader patch entries锛沬nserts/disables/config overrides锛沗!!js` 鍏佽锛?  - package.json锛歜undles = @deepseek-ai/dsh-base + @deepseek-ai/dsh-web-app锛沺atchReload: live
  - profiles/web/node_modules 涓虹嫭绔嬪畨瑁咃紙鍚?@xterm/node-pty 鈫?web profile 宸插甫缁堢鐩稿叧渚濊禆锛熷緟鏍稿疄鏉ユ簮锛?  - 鏃?.agent-presets 鐩綍 鈫?棰勮琛屼笉蹇呴』锛沨ost 琛屼紭鍏?- host 鏈嶅姟鍙敤闈紙catalog 瀹炴祴锛夛細terminals锛圥TY 浼氳瘽娉ㄥ唽琛?registerBackend/spawn/read/send/signal/kill锛夈€乻ubprocess.spawnTerminal銆乻hell銆乯obs銆乻essions/agents/agentTeams/goals/subagents銆乻ettings銆亀ebServer銆乧lientModules銆乭arness 绛?- Client Slots 鍙敤闈紙瀹炴祴鏍戯級锛歴ettings.section锛堟暣椤佃缃〉锛夈€乻ettings.plugins.tab銆乻hell.overlay锛坙ist锛宖rame 绾ф诞灞傦級銆乧onversation.view锛坙ist锛屼細璇濈骇鐩爣瑙嗗浘鍒囨崲锛夈€乧onversation.session.header.utilities/actions銆乻idebar.footer.action銆乼ool.call.toolview銆乼ool.view.cordis(key:self) 绛夛紱**鏃犵粓绔笓鐢?slot銆佹棤鏁寸獥鏇挎崲 slot**锛坮oot/conversation 鏇挎崲 = shadows-shipped-ui 楂樺嵄锛?- GUI 鐩墠鏃犵粓绔?UI锛坅pps/web 鏃?xterm/terminals 寮曠敤锛?
## 钀藉湴璁捐锛堣崏妗堬級

1. **ES 渚э紙鏈€灏忔敼鍔級**锛歴rc/main/index.ts 澧炲姞 headless 鍒嗘敮锛坅rgv `--headless` 鎴?env锛夛紝璺宠繃绐楀彛鍒涘缓銆佹湇鍔＄収璺戯紙鍚?remote锛夛紱蹇呰鏃惰繙绋嬮厤缃斁寮€ passthroughOnly锛堢敤鎴疯缃垨榛樿 env锛夛紱鏂囨。娉ㄦ槑楠岃瘉鏂瑰紡锛坣pm run dev -- --headless锛?2. **DSH Host 鎵╁睍鍖?*锛坧ackages/ 涓嬫柊澧烇紝鍛藉悕 @deepseek-ai/dsh-es-* 寰呭畾锛涘弬鑰?@deepseek-ai/dsh-llm 绛夌粨鏋勶級锛?   - ES 寮曟搸鎷夎捣/瀹堟姢锛氬畾浣?exe锛堝彲閰嶇疆锛氬畨瑁呯洰褰曞€欓€?+ dev 鍏ュ彛锛夈€乻pawn锛坔eadless锛夈€佸氨缁帰娴嬶紙GET / capabilities锛夈€乼oken 璇诲彇锛坮emote-token.txt / config锛夈€佸穿婧冮噸鍚?   - 妗?client锛欻TTP + socket.io-client锛坔arness 闇€鏂板渚濊禆 socket.io-client锛屾垨鏀圭敤 outputHistory 杞鍏滃簳锛?   - 鏄犲皠涓?Cordis 鏈嶅姟/浜嬩欢锛坋sSessions 鍒楄〃銆佽緭鍑烘祦浜嬩欢銆佺敓鍛藉懆鏈熸柟娉曘€佽緭鍏?resize锛? 鍙€夌殑 agent 宸ュ叿锛坋s sessions/send/task 璇箟锛?3. **DSH Client 鍖?*锛坧ackages/client/es-workbench 褰㈡€侊紝@deepseek-ai/dsh-client-鈥︼級锛欵S 宸ヤ綔鍙?UI 鈥斺€?shell.overlay 鍏ㄥ睆宸ヤ綔鍙帮紙浼氳瘽鏍?+ 缁堢鏍囩椤碉級浼樺厛锛泋term.js 渚濊禆杩?bundle锛坲i 鍖?devDeps + external 瑙勫垯瑕佽繃 verify-client-packages锛歞sh.client.external 闇€鏈?supplier锛涙湭鐭?supplier 鍒欑洿鎺ユ墦杩?bundle锛?4. **鎺ョ嚎**锛歱rofile web cordis.patch.yml insert host 琛?+锛坈lient 鍖呭浣曡繘鍏?loader 渚濊禆鍥撅細bundles 鏈哄埗寰呮煡锛屽彲鑳介渶鍔犺繘 web-app bundle 鎴?profile deps锛夛紱pnpm dev:web 鐑洿 client锛沨ost 琛?patchReload:live 鎴栭渶閲嶅惎 host锛堥噸鍚細鏂綋鍓嶄細璇濓紝鏀炬渶鍚庯級
5. **楠岃瘉**锛欸UI 瀹炴祴浼氳瘽鏍?杈撳嚭/杈撳叆/resize/鍚仠锛涗骇鍑轰竴浠?README锛堝畨瑁?浣跨敤/寮曟搸閰嶇疆锛?
## 寮€鏀鹃棶棰橈紙鍚庣画杞閫愪釜瑙ｅ喅锛?- host 缁勫悎鏂拌鑳藉惁 hot reload锛坧atchReload:live 璇箟锛夎繕鏄繀椤婚噸鍚?host 鈫?鍐冲畾椤哄簭
- client 鍖呭浣曡 profile loader 渚濊禆鍙戠幇锛坆undle 渚濊禆 vs profile package.json dependencies锛?dsh-build 浜х墿瀹夎鏈哄埗锛?- ES remote 閴存潈鎻℃墜缁嗚妭锛圚TTP header vs cookie锛泂ocket 鎻℃墜 token 浣嶇疆锛夆€斺€旇 auth.ts/server.ts
- ES token/port 瀹為檯鍊艰鍙栬矾寰勶紙userData/config-paths.ts锛?- xterm 鍦?client bundle 鐨勫紩鍏ユ柟寮忥紙verify-client-packages 绾︽潫锛?- ES 瀹夎鐗?exe 璺緞鎺㈡祴锛坮elease/win-unpacked銆?LOCALAPPDATA%锛?- 浼氳瘽鈥滃惎鍔ㄢ€濊涔夛細妗ヤ粎鍒?ES 宸叉湁浼氳瘽 vs 鐢?DSH 寤烘柊浼氳瘽锛坈laude/codex/opencode/terminal 绫诲瀷锛夛紝棣栫増瀵归綈妗岄潰锛堝垪鍑?+ 鍚仠/杈撳叆宸叉湁浼氳瘽 + 鍙柊寤?terminal/CLI 浼氳瘽锛?
## 浠诲姟椤哄簭
1. ES headless patch锛堝惈涓枃娉ㄩ噴锛夆渽 宸茶惤鍦帮紝lint 0 error
2. 璇?ES auth/server/config-paths 瀹氬崗璁鏍硷紱鍐?bridge 瑙勬牸鍒版湰鏂囦欢
3. harness 鑴氭墜鏋讹細纭鍖呮ā鏉匡紙璇?dsh-llm 鎴?terminal-bash 鍖呯粨鏋?+ ui-subagent/src 缁撴瀯 + tsdown 閰嶇疆鏍蜂緥锛?4. host 鍖呭疄鐜?鈫?缂栬瘧杩囷紙eslint/typecheck 鍗曞寘鎴?pnpm --filter锛?5. client 鍖呭疄鐜帮紙overlay 宸ヤ綔鍙?+ xterm锛夆啋 tsdown bundle
6. 鎺ョ嚎 profile web + dev:web 鐑洿楠岃瘉 + host 琛屾縺娲?7. GUI 瀹炴祴 + README

## ES 渚ф敼鍔ㄥ凡钀藉湴锛堢 2 杞級
`D:\EasySession\src\main\index.ts`锛坣px eslint 鍗曟枃浠?0 error锛夛細
- `isHeadless` = argv 鍚?`--headless` 鎴?env `EASYSESSION_HEADLESS=1`锛坙oadEnvironmentFiles 涔嬪悗姹傚€硷級
- headless 涓嬶細second-instance 蹇界暐锛泂essionExitNotifier 鐩存帴杩斿洖锛泈henReady 涓嶅缓绐椾笉鎸?activate锛屾敞鍐?stdin锛坋nd 鎴栦竴琛?quit锛?SIGINT/SIGTERM 鈫?shutdownApp()锛堜紭闆?flush锛夛紱闈?headless 璺緞鍘熸牱
- 璇箟鎻愰啋锛歴ingle instance lock 涓庢闈?GUI 鍚?userData 浜掓枼 鈫?妗ユ帴蹇呴』 attach-first

## ES remote 鍗忚瑙勬牸锛堝皝鏉匡紝渚?host 妗ュ疄鐜帮級
- REST锛歚http://host:port`锛沗/api/*` 鍏ㄩ儴锛堝惈 /api/health锛夎姹?`Authorization: Bearer <token>`锛涙垚鍔?`{data,requestId}`锛涘け璐?`{code,message,requestId}`锛涢檺娴?240/60s
- 绔偣锛欸ET /api/health锛?api/capabilities锛坧assthroughOnly+capabilities锛夛紱/api/server-info锛沺rojects锛欸ET /api/projects銆丟ET/PATCH/DELETE /api/projects/:id銆丟ET /api/projects/:id/sessions銆?detect銆?prompt銆丳OST /api/projects銆丳OST /api/projects/:id/open銆丳UT /api/projects/:id/prompt锛泂essions锛欸ET /api/sessions锛坱ype/status/projectId/projectPath/parentId 杩囨护锛夈€丟ET /api/sessions/:id/output?lines=銆丳OST /api/sessions锛坈reate锛夈€丳OST /api/sessions/:id/start|pause|restart銆丏ELETE /api/sessions/:id
- socket.io锛坱ransports websocket+polling锛屾彙鎵嬮壌鏉?auth.token 鎴?Authorization header锛変簨浠讹細subscribe{sessionId,historyLines?}(ack) 鈫?鍥炴斁 session:output{sessionId,data,stream,timestamp,seq} + session:status锛泆nsubscribe锛沬nput{sessionId,input}锛堣嚜鍔ㄨˉ \r锛岃姹?running 涓斿凡 subscribe锛夛紱write{sessionId,data}锛堝師鏍凤級锛況esize锛涙埧闂?session:<id>
- passthroughOnly 闂ㄦ帶鐢熷懡鍛ㄦ湡锛?03 PASSTHROUGH_ONLY锛夛紱capabilities 瀛楁瑙?RemoteCapabilityMap
- 閰嶇疆锛歳emote-service-config.json{enabled,host,port,passthroughOnly,tokenMode} + remote-service-secrets.json{customToken} + remote-token.txt锛堚墺64 hex 鑷姩鐢熸垚锛夛紱env 瑕嗙洊 EASYSESSION_REMOTE_ENABLED/HOST/PORT/PASSTHROUGH_ONLY/TOKEN/IDLE_TIMEOUT_MS
- RemoteServiceManager.init() 鈫?applyRuntime()锛歴ettings enabled锛堝惈 env 瑕嗙洊锛夋椂鑷姩璧?gateway锛屾棤闇€ UI锛汦ADDRINUSE 鈫?lastError 涓嶅惎鍔?- 榛樿 127.0.0.1:18765锛涢粯璁?passthroughOnly=true锛涚┖闂叉柇杩為粯璁?30min
- userData锛氬畨瑁呯増 %APPDATA%\easysession锛宒ev 鐗?%APPDATA%\easysession-dev锛坕s.dev 鏀瑰悕锛?
## 妗ュ紩鎿庣鐞嗙瓥鐣ワ紙host 鍖呭疄鐜颁緷鎹級
1. attach-first锛氳 userData remote-service-config.json + remote-token.txt锛坈ustom 鏃惰 secrets 鏂囦欢锛夆啋 鐢?token GET /api/health 鎺㈡祴榛樿/閰嶇疆绔彛锛?00=宸叉湁瀹炰緥鐩存帴 attach锛堢敓鍛藉懆鏈熻兘鍔涚湅鍏?passthroughOnly锛?2. spawn锛氬畨瑁呯増 exe 鍊欓€?%LOCALAPPDATA%\Programs\EasySession\EasySession.exe 涓?release/win-unpacked锛涘甫 --headless + env锛欵ASYSESSION_REMOTE_ENABLED=1銆丳ASSTHROUGH_ONLY=0銆乀OKEN=妗ョ敓鎴?64+ hex銆丳ORT 榛樿 18765锛泂tdin 绠￠亾淇濇寔锛堝涓诲叧闂?鈫?寮曟搸浼橀泤閫€鍑猴紱鍏滃簳 taskkill /T /PID锛?3. 灏辩华杞 /api/health 鈫?200锛涘穿婧冩寚鏁伴€€閬块噸鍚紱鍚?userData 鍏变韩浼氳瘽鏁版嵁
4. 鍐茬獊澶勭悊锛氭闈㈠凡杩愯涓?remote 寮€ 鈫?attach锛況emote 鍏?鈫?鏄庣‘鎶ラ敊锛堟彁绀哄厛閫€鍑烘闈㈢増鎴栧紑鍚叾 remote锛夛紱寮曟搸杩愯涓闈㈢増鏃犳硶鍐嶅惎锛坰ingle lock锛夆€斺€擴I 闇€娉ㄦ槑

## harness 鍖呮ā鏉匡紙宸茶鏍蜂緥锛?- Host 鍖咃紙濡?packages/terminal/terminal-bash锛夛細src/*.ts 鐢?`.ts` 鍚庣紑 import specifier锛涘鍑?`export const name/inject` + `export default { name, inject, apply }`锛坈ordis 鎻掍欢褰㈡€侊紝row name 鍗冲寘鍚嶏級锛沺eer @deepseek-ai/cordis + workspace 鍏勫紵鍖咃紱鏃?tsdown.config锛坱sc 缂栬瘧鍑?lib/锛夛紝鏈?tsconfig.json锛堜豢鍐欏悓鐩綍鍏勫紵锛夛紱config 鐢?schemastery + resolve/validate
- Client 鍖咃紙濡?packages/client/ui-message-feedback / ui-subagent锛夛細package.json 鏈?`dsh.client{inject:[...], platform:"web"}` + exports{"./client"}锛坙ib/client.js锛? "./src/*"锛泂rc/index.ts锛坣ode 闈級+ src/client/*锛堟祻瑙堝櫒闈紝tsdown.config.ts 鎵撳寘鍑?lib/client.js锛夛紱client 闈㈡秷璐?@deepseek-ai/dsh-client-*锛坲i-primitives/ui-slots/ui-renderer/ui-conversation 绛夛級涓?@deepseek-ai/cordis锛涙祴璇?tests/*.client.spec.ts(x)
- 鍚嶅唽鎯緥锛歨ost 鎵╁睍 @deepseek-ai/dsh-<area>-<name>锛堝 dsh-terminal-bash銆乨sh-llm锛夛紱client UI @deepseek-ai/dsh-client-ui-<name>
## 进展记录（第 3 轮：Host 包完成 + mock 验证）
- **ES 补丁 v2**：headless 分支新增控制端口（net server，默认 19765，env EASYSESSION_CONTROL_PORT），收 `quit`/`shutdown` → 优雅关停（GUI 子系统 stdin 在 Windows 不可靠，控制端口为主通道；stdin/SIGINT/SIGTERM 兜底）
- **Host 包 @deepseek-ai/dsh-es-bridge 落地**（D:\deepseek-harness\packages\es\es-bridge\）：
  - src/engine-io.ts：零依赖 engine.io v4/socket.io v5 客户端（Node ≥22 全局 WebSocket；CONNECT 带 auth.token；ping/pong；心跳 dsh:bridge:heartbeat 60s 防 ES idle 断开；断线退避重连）
  - src/rest.ts：REST 客户端（Bearer、envelope 解包、EsBridgeError）
  - src/supervisor.ts：attach-first（读 userData remote-service-config/token 探测 health）→ spawn `--headless`（env EASYSESSION_REMOTE_ENABLED=1/PASSTHROUGH_ONLY=0/PORT/TOKEN=自产 64hex/控制端口；windowsHide；stdout/stderr 尾日志）→ 就绪轮询 → 崩溃退避重启；stop=控制端口 quit → taskkill /T /F 兜底
  - src/bridge.ts：会话缓冲（2000 行）＋watchers 扇出＋订阅管理＋生命周期映射
  - src/routes.ts：webServer 同源路由（GET /es-bridge/state、engine/start|stop、history、session/create|start|pause|restart|destroy|input|write|resize、GET /es-bridge/stream?session= SSE）
  - src/index.ts：cordis 插件（ctx.get('webServer') 可选、ctx.effect 清理、autoStart）
- **登记完成**：tsconfig.base.json 别名（gen-tsconfig-paths）、tsconfig.host.json 引用行；根因：pwsh Set-Content 写入了 UTF-8 BOM 导致 JSON.parse 失败 → 全部文件已去 BOM（后续写入注意！用 [IO.File]::WriteAllText 或显式 utf8NoBOM）
- **验证**：tsc -b 通过；mock 引擎 smoke 15/15 PASS（mock 用 EasySession node_modules 真实 socket.io 服务端库 → 验证客户端与服务端编码互操作）：attach-first、列表、订阅回放+status、write/input echo、resize、create/start/restart/destroy、history 信封 {sessionId,lines}
- 注意：真实 ES output 端点返回 `{sessionId, lines}` 而非裸数组（已按此解包）
- smoke 脚本留存：D:\EasySession\.tmp-es-smoke\{mock-engine.mjs,smoke.mts}（跑法：workdir D:\deepseek-harness + node --import tsx …，需全权限）
- **遗留**：真实引擎 e2e 需用户先构建含 headless 补丁的 ES（release/win-unpacked 为旧版）→ 见接线阶段；Client UI 包未开始
## 进展记录（第 4 轮：Client 工作台包完成）
- **@deepseek-ai/dsh-client-es-workbench**（D:\deepseek-harness\packages\client\es-workbench\）：
  - 结构：src/index.ts（node half 空 apply，进 Loader 名册）；src/client/*：index.ts（注册 sidebar.footer.action 按钮 + shell.overlay 全屏工作台，React.createElement 无 JSX 于 .ts）、Workbench.tsx（会话树分组 + 状态点 + 行内 ▶/⏸/↻/✕、标签页 + TerminalPane、引擎启停/状态 pill、新建会话对话框）、store.ts（useSyncExternalStore 开关）、api.ts（fetch /es-bridge/*）、xterm-vendor.ts（vendored xterm 门面 + CSS 注入）、styles.ts（工作台 CSS 常量）
  - xterm 供应：registry 全权也连不通 → 从 D:\EasySession\node_modules 拷 @xterm/xterm@6 xterm.mjs + addon-fit.mjs + LICENSE 到 src/client/vendor/，css 内嵌 TS 常量（7KB）
  - TerminalPane：EventSource 订阅 history/output/status、seq 水位防重放、onData→write 原样写、ResizeObserver→fit→resize、清理完整
  - 验证：tsc -b 0 错；tsdown 产出 lib/index.js(node) + lib/client.js(469KB/gzip108KB, CJS loader 形态)
- **关键教训**：本环境 pwsh 默认编码写入带 BOM 且 Get-Content 无 BOM 时按 ANSI 读（中文乱码）。此后一律 [IO.File]::ReadAllText/WriteAllText + UTF8Encoding($false)；所有写入后跑 strip-BOM 兜底
- node_modules 依赖：新 client 包用 junction 接入 .pnpm 的 react/react-dom/@types（符号链接需管理员）
- **尚未完成**：host 包 lib/index.js（等官方 build:lib 或局部 tsdown host 配置）；profile web 接线（cordis.patch.yml host 行 + 包链接 + loader 依赖注册）；dev:web 热更与 GUI 验证；真实引擎 e2e（需用户重打包 ES）；README
- 接线探测要点（下一轮）：profiles/web/node_modules/@deepseek-ai/* 链接目标形态（source 还是 store）、clientModules 扫描源（plugin-inventory）、web-app bundle 依赖表、cordis.patch.yml 行语法、patchReload:live 是否热加行## 进展记录（第 5 轮：接线成功 —— 两行插件已热挂载运行中宿主）
- **接线链路**：clientModules 扫描 Loader 行 → 行激活即入图（无需重启宿主，patchReload:live 热重组已验证有效！）
- 关键坑：a) 包解析发生在宿主进程 apps/cli 的模块树 → 需在 D:\deepseek-harness\apps\cli\node_modules\@deepseek-ai\ 下建 junction（profiles 目录的链接对 loader 无效，仅对以 profile 为 cwd 的脚本有效）；b) 补丁 YAML 行尾不能粘注释（曾致解析失败静默不生效）；c) es-bridge 需 inject:['webServer'] 硬依赖否则热挂载竞态下跳过注册（已修）
- 验证证据：GET /es-bridge/state → 200 {engine offline...}；clientModules graph 48 项含 @deepseek-ai/dsh-client-es-workbench（动态探针实测后已清理）
- 文档：两个包 README + D:\EasySession\ES-WORKBENCH-使用说明.md
- 剩余（需用户/后续会话）：
  1) 刷新 GUI 验证工作台 UI（入口/树/空态/引擎离线提示）
  2) 用户重打包 ES（headless）→ 启动引擎 → 真实会话全链路（含终端交互）
  3) 全链路验收后把 es-bridge config.autoStart 开 true## 进展记录（第 6 轮：运行时验证补强）
- CLIENT-SMOKE PASS：VM 内执行 lib/client.js（loader 契约 + 真实 react），apply 注册 sidebar.footer.action 与 shell.overlay 两个席位成功 → 模块初始化/依赖/vendored xterm 无运行时错误
- dev:web 热更链路验证：watch 列表含 packages/client/es-workbench（共 52 个 dsh.client 包）；日志出现 [es-workbench] lib\client.js 469.57 kB CJS Rebuilt；全量 tsc -b tsconfig.client.json 0 错误（新包在 client 聚合类型检查内）
- 探针/后台任务已清理；所有产物就绪
- 唯一剩余外部依赖（需用户）：GUI 刷新目验 + ES 重打包后真实引擎全链路## 进展记录（第 7-8 轮：视觉/交互对齐 ES + Playwright 自检闭环）
- **根因修复**：client 端 slots 必须 `inject: ['slots']`（ctx.get 取不到）；本地模块增强声明 ctx.slots；加了 dataset.esApplied/esSlots 自诊断标记
- **Playwright 自检链路打通**：复铸 `dsh-auth-*` cookie（browser-auth v1 HMAC，secret 来自 .credentials.yaml 的 client-connection/browser-session；base64url 注意 '+','/' 方向）→ 无令牌访问 GUI → 截图+探针脚本 D:\EasySession\.tmp-es-smoke\pw-inspect.mjs（page 需 waitUntil:'load'，networkidle 永不满足）
- **v2 设计对齐**（styles.ts + Workbench.tsx 全重写）：ES GPT Dark 变量全套（bg #0d0d0d/#141414/#212121、文字 #f4f1ea/#ddd8cf/#aaa39a、accent #e8edf3/#f0a064、状态色 #72d66f/#7db7ff/#ff8178、边框 #2a2a2a、圆角 3-10、字体栈含 PingFang/Microsoft YaHei、mono Cascadia）；布局=44px 顶栏（标题+引擎胶囊+搜索 180px+筛选 84px+新建/启停/关闭按钮）+ 左 300px 会话树（grid 16px/1fr/auto、6x8 padding、hairline 顶边、悬停混色、active 混合 accent、状态点、类型角标、悬浮 22px 圆角动作、分组折叠 ▸/▾）+ 右标签页 + 状态栏(xterm)。已 Playwright 截图验证：入口 chip=1、设置分节命中、内嵌工作台 inlineRoot=1、0 console error
- **supervisor 修正**：dispose 不再停引擎（补丁热重载不应杀引擎）；停引擎错误文案『引擎已手动停止』；state 已刷新为无 error
- 遗留：真实引擎 e2e 仍需用户重打包 ES（headless）；v2 用户硬刷新后即可见## 进展记录（第 9 轮：操作逻辑对齐 v3 —— Playwright 驱动全交互验证通过）
- **v3 操作模型复刻自 ES WorkspacePaneTree**：多窗格+每窗格标签页；点击列表→当前窗格打开；右键会话→打开到当前窗格/放到右侧新窗格/启动/暂停/重启/销毁；拆分◫把当前标签移入新窗格；分割条拖拽调宽；均分≣；关闭窗格×；标签右键→关闭/关闭其他/关闭右侧/移到左(右)窗格；侧栏⇄顶部横向车道两种摆位（顶部车道按项目分组、横向滚动）；终端工具栏（自动滚动开关/复制全部/清屏，历史窗口上限 2000 行标注）；新建对话框=项目下拉+路径+类型+名称+创建后暂停
- Playwright 全交互 e2e 16 项全绿：preflight 200、applied/slots 1/1、chip/overlay、点击启动引擎→attach-first 成功(engineOnline=1)、开标签(tabs=1, terminalHost=1)、拆分(panes=2, gutters=1)、右键菜单(7 项)、顶部布局切换；0 console error。脚本 D:\EasySession\.tmp-es-smoke\pw-inspect-v3.mjs（复用 mock-engine + 真实 token 文件 attach；cookie 重铸带重检重试）
- 修复：启动引擎按钮误加 !engineOnline 禁用（离线必须可点）
- 遗留限制（引擎 remote API 无对应端点）：重命名、会话设置、图标、固定/缩放、拖拽排序——菜单项灰置注明；真实引擎 e2e 仍需用户重打包 ES（headless）