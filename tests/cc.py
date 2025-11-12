import random

if __name__ == '__main__':
    with open("no_picture.txt") as f:
        cc=[i.strip() for i in  f.readlines()]
        random.shuffle(cc)
        print(",".join(cc[:1000]))