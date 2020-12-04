function main() {
  refreshToken();
  const artists = getFollow();
  const newRelease = getAlbums(artists);
  if (newRelease[0]) {
    sendmail(newRelease);
  } else {
    sendmail("");
  }
}

//APIをぶっ叩く
function spotifyAPI(url, method, payload,auth="Bearer ") {
  var accessToken = "";
  if (auth == "Bearer ") {
    accessToken = PropertiesService.getScriptProperties().getProperty("accessToken");
  } else if (auth == "Basic ") {
    accessToken = PropertiesService.getScriptProperties().getProperty("refreshBasic");
  }
  const headers = {
    'Authorization': auth + accessToken
  };
  const options = {
    'method': method,
    'headers': headers,
    'payload': payload,
    'muteHttpExceptions': true
  };
  var tryCount = 0;
  while(true) {
    var response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() == 429) {
      Logger.log("Retry-After:" + response.getAllHeaders()["Retry-After"]);
      Utilities.sleep(response.getAllHeaders()["Retry-After"] * 2000);
    } else if (response.getResponseCode() != 200) {
      tryCount += 1;
      if(tryCount >= 3) {
        throw new Error(url+"のリクエストに失敗しました。（エラー: " + response.getResponseCode() + "）："+response);
      }
      Utilities.sleep(1000);
    } else {
      break;
    }
  }
  
  const json = response.getContentText();
  const data = JSON.parse(json);
  return data;
}

//アクセストークンをリフレッシュ
function refreshToken() {
  const payload = {
    'grant_type': 'refresh_token',
    'refresh_token': PropertiesService.getScriptProperties().getProperty("refreshToken")
  };
  const response = spotifyAPI("https://accounts.spotify.com/api/token","post",payload,"Basic ");
  const accessToken = response.access_token;
  PropertiesService.getScriptProperties().setProperty("accessToken",accessToken);
  Logger.log("Token refreshed.");
}

//フォローしているアーティストを取得する
function getFollow() {
  var artists = [];
  var response = spotifyAPI("https://api.spotify.com/v1/me/following?type=artist&limit=50","GET","");
  var followingArtistsArray = response.artists.items;
  var count = Math.ceil(response.artists.total / 50);
  for (let i = 0; i <= count-1; i++) {
    if (i != 0 ) {
      response = spotifyAPI(response.artists.next,"GET","");
      followingArtistsArray = response.artists.items;
    }
    followingArtistsArray.forEach(item => artists.push(item.id));
  }
  Logger.log("フォロー数：" + artists.length);
  return artists;
}

//各アーティストのアルバムをチェック
function getAlbums(artists) {
  const today = Utilities.formatDate(new Date(), "JST", "yyyy-MM-dd");
  Logger.log("日付：%s", today);
  var releaseartist = [];
  var releasealbum = [];
  var albumimage = [];
  artists.forEach(function(artist) {
    var newartist = null;
    var pageurl = "https://api.spotify.com/v1/artists/" + artist + "/albums?market=JP&include_groups=album,single,appears_on&limit=50";
    for ( let i = 0; i <= 3 ;i++) {
      if(!pageurl) { break;}
      const response = spotifyAPI(pageurl,"GET","");
      response.items.forEach(function(item) {
        if (item.release_date == today) {
          if(!(item.album_group == "appears_on" && item.artists[0].name == ("Various Artists" || "ヴァリアス・アーティスト"))) {
            newartist = artist;
            if(!(releasealbum.includes(item.id))) {
              releasealbum.push(item.id);
              albumimage.push(item.images[1].url);
            }
          }
        }
      });
    }
    if (newartist) {
      releaseartist.push(newartist);
    }
  });
  Logger.log("All Artists checked.");
  return [releaseartist,releasealbum,albumimage];
}

//アーティスト名を取得する
function getArtistName(artistIds) {
  var ids = [];
  var names = [];
  var count = 0;
  do {
    count += 50;
    ids = artistIds.slice(count-50,count).join();
    const response = spotifyAPI("https://api.spotify.com/v1/artists?ids=" + ids,"GET","");
    response.artists.forEach(t => names.push(t.name));
  } while (count <= artistIds.length-1);
  Logger.log("ArtistName got.");
  Logger.log(names);
  return names;
}

//メールを送る
function sendmail(newRelease) {
  const names = getArtistName(newRelease[0]);
  const albumId = newRelease[1];
  const imageurl = newRelease[2];
  
  const recipient = PropertiesService.getScriptProperties().getProperty("mailaddress");
  const subject = "Spotify通知";
  const body = "NewRelease";
  
  if (!newRelease) {
    const message = "本日のニューリリースはありません。";
    Logger.log(message);
    MailApp.sendEmail(recipient, subject, message);
    return;
  }
    
  const html = HtmlService.createTemplateFromFile('main');
  var images = "";
  const l = albumId.length;
  for (let i = 0; i <= l-1; i++) {
    images += "<a href='https://open.spotify.com/album/" + albumId[i] + "'><img src='" + imageurl[i] + "' style='width:30%;'></a>";
  }
  html.date = Utilities.formatDate(new Date(), "JST", "yyyy-MM-dd");
  html.names = names.join();
  const output = html.evaluate().append(images).append("</div>").getContent();
  
  MailApp.sendEmail(recipient, subject, body, {htmlBody:output});
}


function test () {
  var options = {
    'method' : 'GET',
    'muteHttpExceptions':true,
    'contentType':'application/xml; charset=utf-8'
  };
  UrlFetchApp.fetch('https://httpbin.org/post', options);
  var response = UrlFetchApp.fetch("https://drive.google.com/uc?id=1Ob6a1ICuiOKrxgicccb5z18WZ81qUimn");
  Logger.log(response.getAllHeaders());
  Logger.log(response);
}