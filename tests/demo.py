import requests

def login_demo():
    r = requests.post(
        'http://localhost:8000/account/login',
        json={'number': '447999803105',"script":"login"},
        timeout=60
    )
    print(r.json())
    # -> {'pairCode': 'xxxxxx', 'mode': 'early', 'note': 'process continues running on server'}


def timeout_demo():
    r = requests.post(
        'http://localhost:8000/account/login',
        json={'script': 'timeout','number': '66961687880',"timeout":10},
        timeout=10
    )
    print(r.json())

def sync_contact_demo():
    r = requests.get(
        'http://localhost:3001/user/contacts',

        timeout=60
    )
    print(r.text)

if __name__ == '__main__':
    login_demo()
