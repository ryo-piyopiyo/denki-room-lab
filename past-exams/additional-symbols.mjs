// Hand-authored geometry checked against the official question images.
// Source ledger and field-by-field coverage: data/symbol-coverage-audit.json.
const ink='#172c38';
const shape=(tag,attrs,text)=>[tag,{fill:'none',stroke:ink,'stroke-width':1.6,...attrs},...(text===undefined?[]:[text])];
const circle=(cx=16,cy=16,r=11,fill='#fff')=>shape('circle',{cx,cy,r,fill});
const rect=(x,y,width,height)=>shape('rect',{x,y,width,height,fill:'#fff'});
const line=(x1,y1,x2,y2)=>shape('line',{x1,y1,x2,y2});
const text=(value,x,y,size=14)=>shape('text',{x,y,fill:ink,stroke:'none','font-family':'Arial, sans-serif','font-size':size},value);
const poly=points=>shape('polygon',{points,fill:ink,stroke:'none'});
const def=(label,viewBox,parts,note)=>({label,viewBox,parts,...(note?{note}:{})});
const lamp=(label,parts)=>def(label,'0 0 58 34',[rect(4,12,50,10),...parts],'蛍光灯形の記号例');
const board=(label,parts)=>def(label,'0 0 60 34',[rect(5,6,50,22),...parts]);
const switchMark=(label,mark)=>def(label,'0 0 42 32',[circle(12,14,3.6,ink),text(mark,20,23)],'一般形の記号例');
const transformer=(label,mark)=>def(label,'0 0 52 36',[circle(17,15,11),text('T',10,21,18),text(mark,32,30)],'用途の文字は円の外に傍記');
const control=(label,mark,note)=>def(label,'0 0 60 36',[circle(15,15,9),circle(15,15,5,ink),text(mark,27,28,14)],note);
const dottedSocket=(label,mark='')=>def(label,'0 0 72 36',[circle(18,16,10),shape('path',{d:'M13 7.339746 A10 10 0 0 0 13 24.660254 Z',fill:ink,stroke:'none'}),circle(20,12,2.1,ink),circle(20,20,2.1,ink),...(mark?[text(mark,33,23,17)]:[])],'1口・一般形。傍記の機能は変わらない');
const socket=[circle(20,17,10),line(16.5,7.6325,16.5,26.3675),line(23.5,7.6325,23.5,26.3675)];
export const ADDITIONAL_SYMBOLS=Object.freeze({
 'light-guidance':lamp('誘導灯（蛍光灯形）',[circle(29,17,8),shape('path',{d:'M29 17 L23.343 11.343 A8 8 0 0 1 34.657 11.343 Z M29 17 L34.657 22.657 A8 8 0 0 1 23.343 22.657 Z',fill:ink,stroke:'none'})]),
 'light-emergency':lamp('非常用照明（蛍光灯形）',[circle(29,17,8,ink)]),
 'light-security':lamp('保安用・発電回路用照明（蛍光灯形）',[...Array.from({length:9},(_,i)=>{const x=4+i*5;return line(x,22,x+10,12)}),circle(29,17,8)]),
 'light-chandelier':def('シャンデリア','0 0 36 36',[circle(18,18,14),text('CH',7,23,15)]),
 'light-ceiling':def('シーリング（天井直付）','0 0 36 36',[circle(18,18,14),text('CL',8,23,15)]),
 'ceiling-rose-round':def('丸形引掛シーリング','0 0 36 36',[circle(18,18,14),shape('path',{d:'M16 11 A7 7 0 0 0 16 25 M20 11 A7 7 0 0 1 20 25'})]),
 'switch-wide':def('ワイドハンドル形点滅器','0 0 32 32',[poly('16,8 24,16 16,24 8,16')],'片切の記号例'),
 'switch-delay':switchMark('遅延スイッチ','D'),
 'switch-remote':switchMark('リモコンスイッチ','R'),
 'transformer-bell':transformer('ベル用変圧器','B'),
 'transformer-remote':transformer('リモコントランス','R'),
 'board-distribution-main':board('配電盤',[line(5,6,55,28),line(5,28,55,6)]),
 'board-control':board('制御盤',[poly('5,6 30,17 5,28'),poly('55,6 30,17 55,28')]),
 'board-branch':board('分電盤',[poly('5,28 55,6 55,28')]),
 'board-experiment':board('実験盤',[poly('5,6 55,6 30,17'),poly('5,28 55,28 30,17')]),
 'socket-ceiling':def('天井付コンセント','0 0 40 36',socket,'1口・一般形の記号例'),
 'socket-wall':def('壁付コンセント','0 0 40 36',[circle(20,17,10),shape('path',{d:'M15 8.339746 A10 10 0 0 0 15 25.660254 Z',fill:ink,stroke:'none'}),line(10.834849,13,29.165151,13),line(10.834849,21,29.165151,21)],'1口・一般形の記号例'),
 'socket-emergency':def('非常コンセント','0 0 56 36',[rect(4,3,48,30),circle(28,18,10),line(24.5,8.6325,24.5,27.3675),line(31.5,8.6325,31.5,27.3675)],'消防活動用のコンセント'),
 'breaker-motor':def('モータブレーカ','0 0 36 36',[rect(5,5,26,26),text('B',11,25,22),line(18,7,18,29)],'Bに縦線を加える記号例'),
 'breaker-earth':def('過負荷保護付き漏電遮断器','0 0 40 36',[rect(4,4,32,28),text('BE',7,24,18)]),
 'switch-box':def('開閉器','0 0 36 36',[rect(5,5,26,26),text('S',11,25,22)]),
 'switch-box-ammeter':def('電流計付き開閉器','0 0 36 36',[rect(4,4,28,28),circle(18,18,12),text('S',11,25,20)]),
 'switch-ras':def('熱線式自動スイッチ','0 0 58 32',[circle(10,14,3.6,ink),text('RAS',18,23,14)],'一般形・センサ付の記号例'),
 'switch-selector':def('リモコンセレクタスイッチ','0 0 36 36',[circle(18,18,12),line(18,6,18,30),line(7.608,12,28.392,24),line(7.608,24,28.392,12)],'回路数は別に傍記'),
 'relay-remote':def('リモコンリレー','0 0 32 32',[poly('16,7 26,25 6,25')],'1個の記号例'),
 'control-push':control('電磁開閉器用押しボタン','B'),
 'control-push-lamp':control('確認表示灯付電磁開閉器用押しボタン','BL'),
 'control-pressure':control('圧力スイッチ','P'),
 'control-float':control('フロートスイッチ','F'),
 'control-floatless':control('フロートレススイッチ電極','LF3','電極3本の記号例'),
 'light-guidance-incandescent':def('誘導灯（白熱灯形）','0 0 34 34',[circle(17,17,10),shape('path',{d:'M17 17 L9.929 9.929 A10 10 0 0 1 24.071 9.929 Z M17 17 L24.071 24.071 A10 10 0 0 1 9.929 24.071 Z',fill:ink,stroke:'none'})],'白熱灯形の例。蛍光灯形とは光源の区分が異なる'),
 'light-emergency-incandescent':def('非常用照明（白熱灯形）','0 0 34 34',[circle(17,17,10,ink)],'白熱灯形の例。蛍光灯形とは光源の区分が異なる'),
 'light-security-incandescent':def('保安用・発電回路用照明（白熱灯形）','0 0 34 34',[circle(17,17,10),line(7.83,21,21,7.83),line(10,24.14,24.14,10),line(13,26.17,26.17,13)],'白熱灯形の例。蛍光灯形とは光源の区分が異なる'),
 'breaker-motor-M':def('モータブレーカ（M傍記）','0 0 52 36',[rect(4,5,26,26),text('B',10,25,22),text('M',34,30,14)],'Bの右下にMを添える別表記'),
 'socket-wall-dots':dottedSocket('壁付コンセント（点による別表記）'),
 'socket-E-dots':dottedSocket('接地極付コンセント（点による別表記）','E'),
 'socket-ET-dots':dottedSocket('接地端子付コンセント（点による別表記）','ET'),
 'socket-EET-dots':dottedSocket('接地極付接地端子付コンセント（点による別表記）','EET'),
 'socket-emergency-dots':def('非常コンセント（点による別表記）','0 0 56 36',[rect(4,3,48,30),circle(28,18,10),circle(24,18,2.1,ink),circle(32,18,2.1,ink)],'消防活動用のコンセント'),
});

// Equivalence is explicit. Type variants are not interchangeable answer choices.
export const SYMBOL_VARIANTS=Object.freeze({
 'light-guidance':{kind:'type-variant',ids:['light-guidance-incandescent']},
 'light-emergency':{kind:'type-variant',ids:['light-emergency-incandescent']},
 'light-security':{kind:'type-variant',ids:['light-security-incandescent']},
 'breaker-motor':{kind:'equivalent',ids:['breaker-motor-M']},
 'socket-wall':{kind:'equivalent',ids:['socket-wall-dots']},
 'socket-E':{kind:'equivalent',ids:['socket-E-dots']},
 'socket-ET':{kind:'equivalent',ids:['socket-ET-dots']},
 'socket-EET':{kind:'equivalent',ids:['socket-EET-dots']},
 'socket-emergency':{kind:'equivalent',ids:['socket-emergency-dots']},
});
