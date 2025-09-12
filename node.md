

发送
{'type': 'account_login', 'msgId': '487d0717218243bcb21a6599f29519e0', 'data': {'number': '919146286978', 'timeout': 60, 'env': 'prod'}}

响应
{'type': 'account_login', 'timestamp': '2025-09-12T07:20:13.346Z', 'msgId': '487d0717218243bcb21a6599f29519e0', 'data': {'pairCode': 'AVNWWZHP', 'mode': 'early', 'code': '200'}}


登录成功

外层code：
100 开始处理
101 等待配对码


200 登录成功 
201 进程正常退出


500 进程异常断开
501 账号登录中，并发处理被拒绝
502 获取配对码被拒绝






