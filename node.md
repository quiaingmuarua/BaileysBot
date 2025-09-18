
登录成功的
🔍 WebSocket 账户登录演示...
✅ WebSocket 连接成功: ws://localhost:8001/ws
📨 欢迎消息: {'type': 'connected', 'timestamp': '2025-09-12T08:56:55.609Z', 'data': {'clientId': 1, 'message': 'WebSocket 连接成功'}}
📤 发送登录请求: {'type': 'account_login', 'msgId': 'af2219f373b74fda980b47aaac457ab8', 'tag': 'ack', 'data': {'number': '66952407035', 'timeout': 60, 'env': 'prod'}}
new_message {'type': 'ack', 'timestamp': '2025-09-12T08:56:55.616Z', 'msgId': 'af2219f373b74fda980b47aaac457ab8', 'data': {'number': '66952407035', 'timeout': 60, 'env': 'prod'}}
new_message {'type': 'account_login', 'timestamp': '2025-09-12T08:56:58.270Z', 'msgId': 'af2219f373b74fda980b47aaac457ab8', 'data': {'code': 200, 'note': 'has login before'}}

获取配对码
🔍 WebSocket 账户登录演示...
✅ WebSocket 连接成功: ws://localhost:8001/ws
📨 欢迎消息: {'type': 'connected', 'timestamp': '2025-09-12T08:48:36.926Z', 'data': {'clientId': 1, 'message': 'WebSocket 连接成功'}}
📤 发送登录请求: {'type': 'account_login', 'msgId': '04f01507d70d444aa61c859127241d59', 'tag': 'ack', 'data': {'number': '918942918591', 'timeout': 60, 'env': 'prod'}}
new_message {'type': 'ack', 'timestamp': '2025-09-12T08:48:36.933Z', 'msgId': '04f01507d70d444aa61c859127241d59', 'data': {'number': '918942918591', 'timeout': 60, 'env': 'prod'}}
new_message {'type': 'account_login', 'timestamp': '2025-09-12T08:48:43.241Z', 'msgId': '04f01507d70d444aa61c859127241d59', 'data': {'pairCode': '5FRF4RZW', 'code': 200}}
new_message {'type': 'account_login', 'timestamp': '2025-09-12T08:49:47.289Z', 'msgId': '04f01507d70d444aa61c859127241d59', 'data': {'code': 503, 'note': 'waiting for pair code timeout'}}






外层code：
100 开始处理
101 请求配对码
102 等待配对(配对码请求成功)


200 登录成功


500 进程异常断开
501 账号登录中，并发处理被拒绝
502 获取配对码被拒绝


tag：server、client、exit(号码退出)

server msg code:
200 业务成功   
3xx  可重试错误
4xx 不可重试


client msg code：
200 账号登录成功
201 收到新消息
。。。。


exit msg code (目前设计)
200 获取配对码后登录成功退出
201 直接登录成功 退出

300 已获取配对码，等待配对超时
301 获取配对码时退出







