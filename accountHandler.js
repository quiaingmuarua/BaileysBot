// accountHandler.js - 共用的账户处理逻辑
import { runAndGetPairCode } from './runAndGetPairCode.js';

// 全局缓存，防止同一号码重复处理
let numberCachedDict = {};

/**
 * 账户登录处理器 - 支持 HTTP 和 WebSocket
 * @param {Object} params - 请求参数
 * @param {string} params.number - 手机号码
 * @param {string} params.type - 消息类型
 * @param {number} [params.timeout=60] - 超时时间（秒）
 * @param {string} [params.script="example"] - 执行脚本名称
 * @param {Object} callbacks - 回调函数
 * @param {Function} callbacks.onResponse - 响应回调
 * @param {Function} callbacks.onError - 错误回调
 * @param {Function} [callbacks.onOutput] - 输出日志回调
 * @returns {Promise}
 */
export async function handleAccountLogin(params, callbacks) {
  const { onResponse, onError, onOutput } = callbacks;
  
  try {
    const body = params ?? {};
    const script = body.script ?? "login";
    const number = (body.number ?? '').toString().trim();
    const type =body.type ?? "";
    const proxy =body.proxy ?? "";
    const target_number =body.target_number ?? "";
    const content =body.content ?? "";
    const timeout = Number.isFinite(Number(body.timeout)) ? Number(body.timeout) : 240;

    if (!number) {
      console.log('❌ 缺少 number 字段');
      return onError({ code: 400, error: 'number 必填' });
    }

    // 检查号码是否正在处理中
    if (numberCachedDict.number === number) {
      console.log('number is in cached');
      return onResponse({ 
        type: 'error',
        number:number,
        code: "500", 
        note: "number is in working" 
      });
    }
    
    // 标记号码为处理中
    numberCachedDict.number = number;

    // 构建命令参数
    const cmdParams = { action: 'login', number, timeout, ...body };
    const cmdString = `node ${script}.js --phoneNumber=${number} --methodType=${type} --proxy=${proxy} --target_number=${target_number} --content=${content}`;
    const timeoutMs = timeout * 1000 + 10_000;

    console.log('➡️ 执行命令:', cmdString, '  (timeoutMs=', timeoutMs, ')');

    let responded = false;
    let  getPairCode= false
    let hasLogin= false

    // 启动账户登录任务
    const taskPromise = runAndGetPairCode({
      cmdString,
      timeoutMs,
      graceKillMs: 3000,                    // TERM 后 3s 再 KILL
      onPairCode: (pairCode) => {
        console.log('🎯 捕获到 pairCode:', pairCode);
        if (!responded) {
          responded = true;
          getPairCode=true
          onResponse({ pairCode, code: 200,tag:"pairCode",  number:number,});
        }
      },
      onLoginStatus: (loginStatus) => {
        console.log("loginStatus:", loginStatus);
      },
      onOutput: (chunk, stream) => {
        // 转发实时日志
        console.log(`[${stream}] ${chunk.trim()}`);
        onOutput?.(chunk, stream);
        if(chunk.trim().includes("message_send_result")){
           let key_str= chunk.trim().match(/tags_(\w+)/)?.[1];
           console.log(`key_str:${key_str}`);
           if(key_str) {
             let key_array = key_str.trim().split("_")
             onResponse({target_number: key_array[0], code: key_array[1], tag: "message_send", number: number,});
           }
        }
      },
    });

    // 处理任务完成
    taskPromise
      .then((result) => {
        // 清除缓存
        numberCachedDict.number = "";
        console.log('✅ 子进程结束:', {
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          pairCode: result.pairCode,
        });
        if(result.exitCode ===200) {
            if(type==="account_login"){
                if( getPairCode === true){
                 onResponse({code: 200, note : "login success",tag:"loginResult",  number:number });
                 }else {

              onResponse({code: 201, note : "has login before",tag:"loginResult" ,  number:number});
            }

            }else{
              onResponse({code: 200, note : "login success",tag:"loginResult",  number:number ,isActive:"active"});
            }


        }else if (result.exitCode===100) {
          onResponse({code: 200, note : "login success",tag:"loginResult",  number:number ,isActive:"unavailable"});

        }
          else{
          if(getPairCode === true ){
              onResponse({ code: 300, note: "waiting for pair code timeout" ,tag:"loginResult",  number:number});
          }
          else {
             onResponse({ code: 301, note: "get pair code timeout" ,tag:"loginResult",  number:number});
          }

        }

      })
      .catch((err) => {
        console.error('🔥 子进程异常:', err);
        numberCachedDict.number = "";
        if (!responded && !hasLogin) {
          responded = true;
          onError({ code: 500, error: err?.message || 'Internal Server Error',tag:"loginResult",  number:number ,target_number:target_number});
        }
      });

    return taskPromise;

  } catch (e) {
    console.error('🔥 账户处理异常:', e);
    numberCachedDict.number = "";
    onError({ code: 500, error: e?.message || 'Internal Server Error',  number:number,target_number:target_number });
  }
}

/**
 * 获取缓存状态
 */
export function getCacheStatus() {
  return { ...numberCachedDict };
}

/**
 * 清除特定号码的缓存
 */
export function clearNumberCache(number) {
  if (numberCachedDict.number === number) {
    numberCachedDict.number = "";
  }
}
