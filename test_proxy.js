import { SocksProxyAgent } from 'socks-proxy-agent'

const proxy = 'socks5://B_38313_US___5_W9axsY1S:121323@gate1.ipweb.cc:7778'
const agent = new SocksProxyAgent(proxy)

async function test() {
  try {
    const res = await fetch('https://ipinfo.io/json', { agent })
    const data = await res.json()
    console.log('代理正常，返回结果:', data)
  } catch (err) {
    console.error('代理请求失败:', err)
  }
}

test()
