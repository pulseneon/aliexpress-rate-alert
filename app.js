const VkBot = require('node-vk-bot-api');
const api = require('node-vk-bot-api/lib/api');

const fs = require('fs');
const { default: axios } = require('axios');

const fetch = require('node-fetch');
const { Headers } = require('node-fetch');

var cheerio = require('cheerio')

require('dotenv').config();
const sleep = ms => new Promise(r => setTimeout(r, ms));

const bot = new VkBot(process.env.TOKEN);

var qiwiHeaders = new Headers({
    'Accept': 'application / json',
    'Content-type': 'application/json',
    'Host': 'edge.qiwi.com'
});

var counter = 0;
var ali = -1;
var cbr = -1;
var qiwiBuy = -1;
var qiwiSell = -1;

function isUsersReg(id, name) {
    let data = fs.readFileSync(process.env.USERS_PATH);
    data = JSON.parse(data);

    for (const item in data['users_id']) {
        if (data['users_id'][item]['id'] == id) {
            return false;
        }
    }

    let user = id_template = { 'id': id, 'name': name };
    data['users_id'].push(user);

    fs.writeFile(process.env.USERS_PATH, JSON.stringify(data), function(err, result) {
        if (err) {
            console.log(err);
            return false;
        }
    });
    return true;
}

async function mailing(msg) {
    let data = fs.readFileSync(process.env.USERS_PATH);
    data = JSON.parse(data);

    for (const item in data['users_id']) {
        id = data['users_id'][item]['id'];
        try {
            await bot.sendMessage(id, msg);
        } catch {}
    }
}

async function formatMessage() {
    try {
        var isChange = false;

        async function difference(old, current) {
            if (old == current || old == -1)
                return ''
            else {
                let diff = current - old;
                if (diff > 0)
                    return `(📉 упал на ${diff.toFixed(3)} руб)`
                else
                    return `(📈 вырос на ${Math.abs(diff).toFixed(3)} руб)`
            }
        }

        async function getAli() {
            const getHtml = async(url) => {
                const { data } = await axios.get(url);
                return cheerio.load(data);
            };

            const $ = await getHtml('https://helpix.ru/currency/');
            let currency = $('td.b-tabcurr__td').eq(2).text();
            if (currency == '-') // на случай если сайт не обновил текущий курс
                currency = $('td.b-tabcurr__td').eq(8).text();
            return currency;
        }

        const newCbr = await fetch('https://www.cbr-xml-daily.ru/daily_json.js')
            .then(response => response.json())
            .then((data) => {
                currency = data['Valute']['USD']['Value'];
                return Number(currency).toFixed(2);
            });

        // array
        const newQiwi = await fetch('https://edge.qiwi.com/sinap/crossRates', headers = qiwiHeaders)
            .then(response => response.json())
            .then((data) => {
                rubToUsd = data["result"][10]['rate'];
                usdToRub = Number((1 / data["result"][14]['rate']).toFixed(2));

                let currency = [rubToUsd, usdToRub];
                return currency;
            });

        const newAli = await getAli();

        // обновление текущих курсов    
        aliDiff = await difference(ali, newAli);
        cbrDiff = await difference(cbr, newCbr);
        qiwiSellDiff = await difference(qiwiSell, newQiwi[0]);
        qiwiBuyDiff = await difference(qiwiBuy, newQiwi[1]);

        if (ali != newAli) {
            ali = newAli;
            isChange = true;
        }

        if (cbr != newCbr) {
            cbr = newCbr;
            isChange = true;
        }

        if (qiwiSell != newQiwi[0]) {
            qiwiSell = newQiwi[0];
            isChange = true;
        }

        if (qiwiBuy != newQiwi[1]) {
            qiwiBuy = newQiwi[1];
            isChange = true;
        }

        if (isChange) {
            console.info(`Курс запарсен. Текущие валюты: Алиэкспресс: ${ali} руб. | ЦБР: ${cbr} руб. | Киви покупка: ${qiwiBuy} руб. | Киви продажа: ${qiwiSell} руб.`);
            let time = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
            counter++;
            if (counter % 2 == 0)
                message = `🔸 Курс валют на ${time}:\n\nАлиэкспресс: ${ali} руб. ${aliDiff}\nЦБР: ${cbr} руб. ${cbrDiff}\n\nКиви покупка: ${qiwiBuy} руб. ${qiwiBuyDiff}\nКиви продажа: ${qiwiSell} руб. ${qiwiSellDiff}`;
            else
                message = `🔹 Курс валют на ${time}:\n\nАлиэкспресс: ${ali} руб. ${aliDiff}\nЦБР: ${cbr} руб. ${cbrDiff}\n\nКиви покупка: ${qiwiBuy} руб. ${qiwiBuyDiff}\nКиви продажа: ${qiwiSell} руб. ${qiwiSellDiff}`;
            await mailing(message);
        } else
            console.info(`Курс запарсен. Изменений нет`);

    } catch (e) {
        console.error(e);
    }
}


bot.on(async(ctx) => {
    try {
        let id = ctx['message']['from_id'];

        let user = await api('users.get', {
            user_ids: id,
            access_token: process.env.TOKEN,
        });

        let name = `${user.response[0].first_name} ${user.response[0].last_name}`;
        if (isUsersReg(id, name)) {
            ctx.reply('Вы успешно зарегистрировались в системе.');
            sleep(500);
            ctx.reply(`🔹 Текущий курс валют:\n\nАлиэкспресс: ${ali}\nЦБР: ${cbr}\n\nКиви покупка: ${qiwiBuy}\nКиви продажа: ${qiwiSell}`);
            sleep(1000);
            ctx.reply('Ожидайте дальнейшего обновления курса. Не переживайте, я обязательно оповещу вас.');
            console.log(`Зарегистрирован новый пользователь`);
        } else {
            ctx.reply('Ожидайте обновление курса');
        }
    } catch (e) {
        console.error(`bot.on error: ${e}`);
    }
});

formatMessage();
let interval = setInterval(formatMessage, 900 * 1000);
bot.startPolling((err) => {
    if (err) {
        console.error(err);
    }
});