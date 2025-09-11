import requests

def login_demo():
    r = requests.post(
        'http://localhost:3000/account/login',
        json={'number': '66961687880',"script":"login"},
        timeout=10
    )
    print(r.json())
    # -> {'pairCode': 'xxxxxx', 'mode': 'early', 'note': 'process continues running on server'}


def timeout_demo():
    r = requests.post(
        'http://localhost:3000/account/login',
        json={'script': 'timeout','number': '66961687880'},
        timeout=10

    )
    print(r.json())

if __name__ == '__main__':
    timeout_demo()
