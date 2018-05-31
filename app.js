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
  StellarSdk = require('stellar-sdk');

var server = new StellarSdk.Server(config.stellarServer);
var es = server.trades().cursor('now').stream({
    onmessage: function (message) {
        console.log(message)
    }
})

var app = express();
app.listen(config.port);
app.on('error', function (err) {
    console.log('on error handler');
    console.log(err);
});