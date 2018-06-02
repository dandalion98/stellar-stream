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

let accounts = new Set()
accounts.add("GAGX6QWJNQ22UO4VU6AOJV65SXRKWUJVZ3FOZNZYYF4FWKA5VCUW7W5W")
// C1
accounts.add("GC3IUU5LCEAQ5T4NV236TQ6AR5V3YRS3HADI5JTXTIAO2AAEG4Y25R3Y")
// C2
accounts.add("GCTPYCIMKYKY7HFXHLTHKPZ2543XGIZG2B3IFIWYTTA2GJIN7F37R73A")

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
    log.info("initializing Kafka")
    return new Promise((resolve, reject) => {
        kclient.on('ready', async () => {
            resolve();
        });
    });
}

async function fetchTrades() {
    console.log("fetching")
    var trades = await server.trades().order('desc').limit(50).call()
    console.log("fetched")
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

        // let record = _.pick(trade, ["base_account", 
        //                             "base_amount", 
        //                             "base_asset_type",
        //                             "counter_account",
        //                             "counter_amount",
        //                             "counter_asset_type",
        //                             "counter_asset_code",
        //                             "counter_asset_issuer",
        //                             "base_is_seller",
        //                             "price"])
        let record
        if (accounts.has(trade.base_account)) {
            record = {
                fromAccount: trade.base_account,
                fromAmount: trade.base_amount,
                fromAssetCode: trade.base_asset_code,                                
                fromAssetType: trade.base_asset_type,
                fromAssetIssuer: trade.base_asset_issuer,
                toAmount: trade.counter_amount,
                toAssetType: trade.counter_asset_type,
                toAssetCode: trade.counter_asset_code,                                
                toAssetIssuer: trade.counter_asset_issuer
            }
            console.dir(record)
            payload.push({ topic: config.kafka.outputTradesTopic, messages: JSON.stringify(record) })
        } 
        
        if (accounts.has(trade.counter_account)) {
            record = {
                fromAccount: trade.counter_account,
                fromAmount: trade.counter_amount,
                fromAssetCode: trade.counter_asset_code,                                
                fromAssetType: trade.counter_asset_type,
                fromAssetIssuer: trade.counter_asset_issuer,
                toAmount: trade.base_amount,
                toAssetType: trade.base_asset_type,
                toAssetCode: trade.base_asset_code,                                                
                toAssetIssuer: trade.base_asset_issuer
            }
            console.dir(record)            
            payload.push({ topic: config.kafka.outputTradesTopic, messages: JSON.stringify(record) })            
        }
    }

    if (firstTradeId) {
        lastTradeId = firstTradeId      
    }

    if (payload.length > 0) {
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