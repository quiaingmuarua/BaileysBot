import requests

r = requests.post(
    'http://localhost:3000/account/login',
    json={'number': '66961687880', 'timeout': 90, 'clean': 'true'}
)
print(r.json())
# -> {'pairCode': 'xxxxxx', 'mode': 'early', 'note': 'process continues running on server'}
