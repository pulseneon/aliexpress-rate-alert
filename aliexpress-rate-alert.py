from datetime import datetime
import json
import requests
import threading
import telebot

from bs4 import BeautifulSoup
# pip install lxml

PATH = 'config.json'
ali_currency, cbr_currency  = (-1, -1)

ali_page = 'https://helpix.ru/currency/'
cbr_page = 'https://www.cbr.ru/key-indicators/'
qiwi_page = 'https://qiwi.com/payment/exchange'

user_agent = {'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': 'https://www.google.com/',
            'User-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36'}


def json_load():
    with open(PATH) as f:
        data = json.load(f)

    token = data.get('token', None)
    users_list = data['users_id']
    users = []

    for i in range(len(users_list)):
        users.append(users_list[i]['id'])

    return token, users


def json_add_user(id):
    with open(PATH) as f:
        data = json.load(f)
        
        for i in range(len(data['users_id'])):
            if (data['users_id'][i]['id'] == id):
                return 0

        id_template = {'id': id}
        data['users_id'].append(id_template)
        print(data)
        f.close
    with open(PATH, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
        f.close
    return 1


# parse dollar exchange rate aliexpress
def parse_aliexpress():
    page = requests.get(ali_page, headers=user_agent)
    html = BeautifulSoup(page.text, 'lxml')

    table = html.find('table', class_='b-tabcurr')
    
    catalog = []
    
    for i in table.find_all('tr'):
        for j in i.find_all('td'):
            catalog.append(j.text)

    # else today not updating currency
    if catalog[2] == '-':
        currency = catalog[8]
    else:
        currency = catalog[2]
    return currency

# parse dollar exchange rate сbr
def parse_cbr():
    try:
        page = requests.get(cbr_page, headers=user_agent)
        html = BeautifulSoup(page.text, 'lxml')

        table = html.find(text="валюта").find_parent("table")
    
        catalog = []
    
        for i in table.find_all('tr'):
            for j in i.find_all('td'):
                catalog.append(j.text)

        currency = catalog[5]
        currency = currency.replace(',', '.')
        currency = float(currency)

        return currency
    except Exception as e:
        print(f"[parse_cbr][error]: {e}")
        return -1

# constantly compare courses and send information 
def receiving_currency():
    threading.Timer(1000, receiving_currency).start()
    print('[receiving_currency] restart func')
    
    global ali_currency
    global cbr_currency
    is_changed = False

    new_parse = parse_aliexpress()
    print(f'[receiving_currency] ali reply: {new_parse}')
    if ali_currency != new_parse:
        ali_currency = parse_aliexpress()
        is_changed = True
    
    new_parse = parse_cbr()
    print(f'[receiving_currency] сbr reply: {new_parse}')
    if new_parse != -1:
        if cbr_currency != new_parse:
            cbr_currency = parse_cbr()
            is_changed = True

    # formation message
    if is_changed:
        datatime = datetime.now()
        datatime = datatime.strftime('%Y-%m-%d %H:%M:%S')

        message = f'<b>🔸 Состояние курсов на <i>{datatime}</i></b>\n\n\
            <b>Aliexpress:</b> {ali_currency} руб.\n\
            <b>Центральный банк:</b> {cbr_currency} руб.'

        with open(PATH) as f:
            data = json.load(f)
            f.close
        for i in range(len(data['users_id'])):
            id = data['users_id'][i]['id']
            bot.send_message(id, message, parse_mode='HTML')
            print(f'[receiving_currency] currency send to {id} id')

token, users = json_load()
bot = telebot.TeleBot(token, parse_mode=None)

@bot.message_handler(commands=['start'])
def reg_message(message):
    if json_add_user(message.chat.id) == 0:
        bot.send_message(message.chat.id, '<b>Ваш профиль уже зарегистрирован в системе.</b> Ожидайте обновления курса', parse_mode='HTML')
    else:
        bot.send_message(message.chat.id, '<b>Вы успешно зарегистрировались в системе.</b> Ожидайте обновления курса', parse_mode='HTML')

receiving_currency()
bot.infinity_polling(none_stop=True)
