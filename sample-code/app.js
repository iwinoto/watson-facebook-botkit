/**
 * Copyright 2017 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


// require('dotenv').load();

var Botkit = require('botkit');
var express = require('express');
var jsonfile = require( 'jsonfile' );
var Store = require("jfs");
var botStorage = new Store("data");
var FB = require('fb');
var _replace = require('lodash.replace');

var vcap = {};
if( process.env.VCAP_SERVICES ) {
    vcap = JSON.parse( process.env.VCAP_SERVICES );
} else {
    vcap = jsonfile.readFileSync('env.json');
}

var LanguageTranslatorV2 = require('watson-developer-cloud/language-translator/v2');

var translator = new LanguageTranslatorV2(vcap.language_translator[0].credentials);

var CONVERSATION_USERNAME = vcap.conversation[0].credentials.username;
var CONVERSATION_PASSWORD = vcap.conversation[0].credentials.password;

var middleware = {};

middleware.default = require('botkit-middleware-watson')({
  username: CONVERSATION_USERNAME,
  password: CONVERSATION_PASSWORD,
  workspace_id: process.env.CONVERSATION_WORKSPACE_ID,
  version_date: '2016-09-20'
});

var convMiddleware = middleware.default;

// Configure your bot.
var controller = Botkit.facebookbot({
  access_token: process.env.FB_ACCESS_TOKEN,
  verify_token: process.env.FB_VERIFY_TOKEN
});

var fbBot = controller.spawn({});

// controller.middleware.receive.use(fbuser.receive)

controller.on('facebook_referral',function(bot, message) {
  if (message.referral) {
    message.text = message.referral.ref;

    convMiddleware.interpret(bot, message, function(err) {
      if (!err){
        if (message.watsonData) {
          getFBUser(bot, message, function(err){
            bot.reply(message, "hello " + message.userProfile.first_name);
            setTimeout(function() {
              bot.reply(message, message.watsonData.output.text.join('\n'));
            },200);
          });
        }
        else {
          bot.reply(message,"[ERROR]");
          console.log(message);
        }
      }
    });
  }
  else {
    bot.reply(message, 'Hi, can I be of assistance?');
  }
});

controller.on('facebook_optin', function(bot, message) {

    bot.reply(message, 'Welcome to my app!');

});

controller.on('facebook_postback', function(bot, message) {
    console.log(JSON.stringify(message));
    if (message.referral) {
      var promo = message.referral.ref;
      message.text = message.referral.ref;
      convMiddleware.interpret(bot, message, function(err) {
        if (!err){
          if (message.watsonData) {
            getFBUser(bot, message, function(err){
              bot.reply(message, "Hello " + message.userProfile.first_name);
              setTimeout(function() {
                bot.reply(message, message.watsonData.output.text.join('\n'));
              },200);
            });
          }
          else {
            bot.reply(message,"[ERROR]");
            console.log(message);
          }
        }
      });
    }
    else {
      bot.reply(message, 'Hi, can I be of assistance?');
    }


});

controller.hears('(.*)', 'message_received', function(bot, message) {
  controller.log('Facebook message received');
  controller.log(JSON.stringify(message));
  translator.identify({ text: message.text},
    function(err, identifiedLanguages) {
      if (err) {
        console.log(err);
      }
      else {
        var conWSEnv = "CONVERSATION_WORKSPACE_ID";
        var detectedLanguage = identifiedLanguages.languages[0].language;
        if (process.env[conWSEnv + "_" + detectedLanguage]) {
          conWSEnv = conWSEnv + "_" + detectedLanguage;
        }

        //load conversation by detected language
        if (middleware[detectedLanguage]) {
          convMiddleware = middleware[detectedLanguage];
        }
        else {
          middleware[detectedLanguage] = require('botkit-middleware-watson')({
            username: CONVERSATION_USERNAME,
            password: CONVERSATION_PASSWORD,
            workspace_id: process.env[conWSEnv],
            version_date: '2016-09-20'
          });
          convMiddleware = middleware[detectedLanguage];
        }



        convMiddleware.interpret(bot, message, function(err) {
          if (!err){
            if (message.watsonData) {
              // bot.reply(message, message.watsonData.output.text.join('\n'));
              var replyMsg = _replace(message.watsonData.output.text,new RegExp("<br>","g"),"\n");
              bot.reply(message, replyMsg);
            }
            else {
              bot.reply(message,"[ERROR]");
              console.log(message);
            }
          }
      	});
      }
    }
  );
});

// Create an Express app
// var app = express();
var port = process.env.PORT || 5000;

controller.setupWebserver(port,function(err,webserver) {
  controller.createWebhookEndpoints(controller.webserver, fbBot, function() {
      console.log('This bot is online!!!');
  });
})


function getFBUser(bot, message, callback) {
  FB.setAccessToken(process.env.FB_ACCESS_TOKEN);
  FB.api(message.user, {fields: ['first_name', 'last_name', 'locale']}, function (fb_user) {
      if (!fb_user){
          logConsole('error', 'ERROR - No user found for facebook id:'+ message.user);
          callback(new Error('User not found'));
      }

      else if (fb_user.error){
          logConsole('error','ERROR - facebook error:'+ message.user);
          callback(fb_user.error)
      }

      else {
          fb_user.id = message.user;
          message.userProfile = fb_user;
          callback();
      }
  });
}
