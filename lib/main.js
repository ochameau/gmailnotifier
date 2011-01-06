const timer = require("timer");
const prefs = require("preferences-service");
const widgets = require("widget");
const panels = require("panel");
const data = require("self").data;
const pageMod = require("page-mod");

const alienfx = require("jetalienfx");

// Alien FX code
function stringToColor(str) {
  str=str.replace(/#|\s/g,"");
  let i = parseInt("0x"+str);
  return [(i&0xFF0000)>>112,(i&0x00FF00)>>72,i&0x0000FF];
}

function resetAlienFX(region) {
  var color = stringToColor(prefs.get("alienfx.default-color","#00FF00"));
  console.log(color.join(','));
  alienfx.setColor(region, color[0], color[1], color[2]);
}
function highlightAlienFX(region) {
  var color = stringToColor(prefs.get("alienfx.default-color","#00FF00"));
  var warnColor = stringToColor(prefs.get("alienfx.warn-color","#FF0000"));
  alienfx.setColorsTransitions(region,[color,warnColor,color],100);
}

// State handling
const STATE_DEFAULT = 1;
const STATE_WARN = 2;
let state = {
  mail: -1,
  chat: -1
};
function setState(type, newState, forceUpdate) {
  if (type=="all") {
    setState("mail",newState,forceUpdate);
    require("timer").setTimeout(function () {
      setState("chat",newState,forceUpdate);
    }, 2000);
    return;
  }
  if (newState==state[type] && !forceUpdate) return console.log("same state");
  state[type]=newState;
  var region;
  if (type=="mail")
    region = alienfx.REGIONS.RIGHT_SPEAKER;
  else if (type=="chat")
    region = alienfx.REGIONS.LEFT_SPEAKER;
  else
    return console.error("Unknown type : "+type);
  console.log("set state for "+type+" in region "+region+" to "+state[type]);
  if (state[type]==STATE_DEFAULT) {
    resetAlienFX(region);
  } else if (state[type]==STATE_WARN) {
    highlightAlienFX(region);
  }
}


// Display a widget linked to a panel 
// to allow color setup!
widgets.Widget({
  label: "Gmail Notifier",
  contentURL: "http://mail.google.com/favicon.ico",
  panel : panels.Panel({
    width: 240,
    height: 150,
    contentURL: data.url("panel.html"),
    contentScript: 'init("'+prefs.get("alienfx.default-color","#00FF00")+'",\
                         "'+prefs.get("alienfx.warn-color","#FF0000")+'");\
                    document.getElementById("form").onsubmit = function () {\
                     postMessage(document.getElementById("default").value.replace(/,/,"")+","+document.getElementById("warn").value.replace(/,/,""));\
                     return false;\
                   };',
    contentScriptWhen: 'ready',
    onMessage: function(message) {
      var a = message.split(',');
      prefs.set("alienfx.default-color",a[0]);
      prefs.set("alienfx.warn-color",a[1]);
      setState("all",state,true);
      this.hide();
    }
  })
});


setState("all",STATE_DEFAULT);

let unreadCounts = {
  chat : 0,
  mail : 0
};
pageMod.PageMod({
  include: ["*.mail.google.com"],
  contentScriptWhen: 'ready', // 17, 1, 1, 0, 1
  contentScript: ['var hadUnreadMessages = false; var previousUnreadMails = -1; var warnedForMails=false;' +
                  'function checkForChat() {' +
                  '  var chatTitles = document.getElementsByClassName("Hz");' +
                  '  var hasUnreadMessage = chatTitles && chatTitles.length>0;' + 
                  '  var inbox = document.getElementsByClassName("TN");' +
                  '  var unreadMails = -1;' +
                  '  if (inbox && inbox.length>0) {' + 
                  '    var m = inbox[0].textContent.match(/\\((\\d+)\\)\\s*$/);' +
                  '    if (m && m[1]) unreadMails = m[1]; else unreadMails=0;' +
                  '  }' +
                  '  if (unreadMails!=previousUnreadMails) {' +
                  '    if (previousUnreadMails!=-1) {' +
                  '      if (unreadMails>0) {'+
                  '        postMessage({type:"mail",state:true,count:unreadMails}); warnedForMails=true;' +
                  '      } else if (warnedForMails) {' +
                  '        postMessage({type:"mail",state:false}); warnedForMails=false;' +
                  '      }' +
                  '    }' +
                  '    previousUnreadMails = unreadMails;' +
                  '  }' +
                  '  if (hasUnreadMessage == hadUnreadMessages) return;' +
                  '  hadUnreadMessages = hasUnreadMessage;' +
                  '  postMessage({type:"chat",state:hasUnreadMessage});' +
                  '};' +
                  'document.addEventListener("DOMSubtreeModified",checkForChat,false);' +
                  'document.body.onfocus = function () {' +
                  '  if (warnedForMails) {' +
                  '    postMessage({type:"mail",state:false});' +
                  '    warnedForMails = false;' +
                  '  }' +
                  '}'
                  ],
  onAttach: function onAttach(worker) {
    worker.on('message', function(data) {
      
      if (data.state)
        unreadCounts[data.type]++;
      else
        unreadCounts[data.type]--;
      console.log("receive state change message : "+data.type+" - "+data.state+" -> "+unreadCounts[data.type]);
      if (unreadCounts[data.type]==0)
        setState(data.type,STATE_DEFAULT);
      else if (unreadCounts[data.type]==1)
        setState(data.type,STATE_WARN);
    });
  }
});

require("unload").when(
  function() {
    resetAlienFX();
  });
