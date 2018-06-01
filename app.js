'use strict';

var _ = require('lodash'),
  path = require('path'),
  log = require('tracer').colorConsole(),
  colors = require("colors"),
  queryLog = require('tracer').colorConsole({
    methods:["info"],
    filters:[colors.grey]
    }),  
  moment=require('moment'), 
    express = require('express'),
    config = require('./config/config'),
    kafka = require('kafka-node'),
    StellarSdk = require('stellar-sdk'),
    util = require('util');


async function main() {
    await initKafka();
    fetchTrades();
}

let lastTradeId;
var server = new StellarSdk.Server(config.stellarServer);

var KeyedMessage = kafka.KeyedMessage;
var Client = kafka.Client;

let kclient = new Client('localhost:2181', 'ss-producer', {
    sessionTimeout: 300,
    spinDelay: 100,
    retries: 2
})
const kproducer = new kafka.HighLevelProducer(kclient);
let ksend = util.promisify(kproducer.send).bind(kproducer);

const topics = [{
    topic: config.kafka.inputSubscribeTopic,
    offset: 0, 
    partition: 0
}]
const kconsumer = new kafka.HighLevelConsumer(kclient, topics, {});

kconsumer.on('message', function (message) {
    log.info("got msg")
    console.dir(message) 
    // {
    //     topic: 'stellar-stream-subscribe',
    //         value: 'yoyo',
    //             offset: 3,
    //                 partition: 0,
    //                     highWaterOffset: 4,
    //                         key: null
    // }
});


async function initKafka() {
    return new Promise((resolve, reject) => {
        kclient.on('ready', async () => {
            resolve();
        });
    });
}

async function fetchTrades() {
    console.log("fetching")
    var trades = await server.trades().order('desc').limit(50).call()
    let firstTradeId
    let payload = []
    for (let trade of trades.records) {
        if (trade.id == lastTradeId) {
            break
        }

        if (!firstTradeId) {
            console.dir(trade)
            firstTradeId = trade.id;
        }

        let record = _.pick(trade, ["base_account", 
                                    "base_amount", 
                                    "base_asset_type",
                                    "counter_account",
                                    "counter_amount",
                                    "counter_asset_type",
                                    "counter_asset_code",
                                    "counter_asset_issuer",
                                    "base_is_seller",
                                    "price"])
        payload.push({ topic: config.kafka.outputTradesTopic, messages: JSON.stringify(record)})
    }

    if (firstTradeId) {
        lastTradeId = firstTradeId
        await ksend(payload)
    }

    log.info("got " + payload.length + " trades last=" + lastTradeId)
    setTimeout(async function() {
            await fetchTrades()
        }, 
        3000);
}

main()

var app = express();
app.listen(config.port);
app.on('error', function (err) {
    console.log('on error handler');
    console.log(err);
});


process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});