function main() {
  refreshToken();
  const artists = getFollow();
  const newRelease = getAlbums(artists);
  const arrangedRelease = arrangeNewRelease(newRelease);
  if (arrangedRelease) {
    sendmail(arrangedRelease);
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
  var releases = [];
  artists.forEach(function(artist) {
    var pageurl = "https://api.spotify.com/v1/artists/" + artist + "/albums?market=JP&include_groups=album,single,appears_on&limit=50";
    for ( let i = 0; i <= 3 ;i++) {
      if(!pageurl) { break;}
      const response = spotifyAPI(pageurl,"GET","");
      response.items.forEach(function(item) {
        if(item.release_date == today && !(item.album_group == "appears_on" && item.artists[0].name == ("Various Artists" || "ヴァリアス・アーティスト"))) {
          var releaseAlbum = {
            "artist":[artist],
            "album":[{
              "id":item.id,
              "imageUrl":item.images[1].url
            }]
          };
          releases.push(releaseAlbum);
        }
      });
      pageurl = response.next;
    }
  });
  Logger.log("All Artists checked.");
  return [releases];
}

function arrangeNewRelease(releases) {
  releases.sort(function(a,b) { //アルバム順のソート
    var nameA = a.album.id
    var nameB = b.album.id
    if (nameA < nameB) {
      return -1;
    }
    if (nameA > nameB) {
      return 1;
    }
    // names must be equal
    return 0;
  });
  var l = releases.length;
  for(let i = 0;i <= l-2; i++) {
    if(releases[i].album.id == releases[i+1].album.id) {　//アルバムが重複している場合に統合
      releases[i].artist = releases[i].artist.concat(releases[i+1].artist);
      releases.splice(i+1,1);
      l -=1; //要素数に合わせてlを1減らす
      i -=1; //3枚以上のアルバム重複に対応
    }
  }
  releases.sort(function(a,b) { //アーティスト順のソート
    var nameA = a.artist
    var nameB = b.artist
    if (nameA < nameB) {
      return -1;
    }
    if (nameA > nameB) {
      return 1;
    }
    // names must be equal
    return 0;
  });
  var l = releases.length;
  for(let i = 0;i <= l-2; i++) {
    if(releases[i].artist == releases[i+1].artist) {　//アーティストが重複している場合に統合
      releases[i].album = releases[i].album.concat(releases[i+1].album);
      releases.splice(i+1,1);
      l -=1; //要素数に合わせてlを1減らす
      i -=1; //3つ以上のアーティスト重複に対応
    }
  }
  Logger.log("new Release arranged.");
  Logger.log(releases);
  return releases;
}

//アーティスト名を取得する
function getArtistName(artistIds) {
  var nameDic = {};
  var ids = [];
  var names = [];
  var count = 0;
  do {
    count += 50;
    ids = artistIds.slice(count-50,count).join();
    const response = spotifyAPI("https://api.spotify.com/v1/artists?ids=" + ids,"GET","");
    var l = response.artists.length;
    for (let i = 0; i <= l; i++) {
      nameDic[ids[i]] = response.artists.name;
    }
  } while (count <= artistIds.length-1);
  Logger.log("ArtistName got.");
  Logger.log(names);
  return nameDic;
}

//アルバム名を取得する
function getAlbumName(albumIds) {
  var nameDic = {};
  var ids = [];
  var names = [];
  var count = 0;
  do {
    count += 50;
    ids = albumIds.slice(count-50,count).join();
    const response = spotifyAPI("https://api.spotify.com/v1/albums?market=JP&ids=" + ids,"GET","");
    var l = response.albums.length;
    for (let i = 0; i <= l; i++) {
      nameDic[ids[i]] = response.albums.name;
    }
  } while (count <= albumIds.length-1);
  Logger.log("AlbumName got.");
  Logger.log(names);
  return nameDic;
}


//メールを送る
function sendmail(newRelease) {
  const recipient = PropertiesService.getScriptProperties().getProperty("mailaddress");
  const subject = "Spotify通知";
  const body = "NewRelease";
  
  if (!newRelease) {
    const message = "本日のニューリリースはありません。";
    Logger.log(message);
    MailApp.sendEmail(recipient, subject, message);
    return;
  }
  var artistIds = [];
  var albumIds = [];
  newRelease.forEach(function(release) {
    artistIds.concat(release.artist);
    albumIds.concat(release.album);
  });
  const artistNameDic = getArtistName(artistIds);
  const albumNameDic = getAlbumName(albumIds);
  var description = "";
  newRelease.forEach(function(release) {
    var artists = [];
    var albums = [];
    var images = "";
    release.artist.forEach(art => artists.push(artistNameDic[art]));
    release.album.id.forEach(albId => albums.push(albumNameDic[albId]));
    release.album.forEach(alb => images += "<a href='https://open.spotify.com/album/" + alb.id + "'><img src='" + alb.imageUrl + "' style='width:30%;'></a>");
    description += "<br>" + artists.join() + "の『" + albums.join("』,『") + "』<br><div style='float:left;'>" + images + "</div>";
  });
  
  const html = HtmlService.createTemplateFromFile('main');
  html.date = Utilities.formatDate(new Date(), "JST", "yyyy-MM-dd");
  const output = html.evaluate().append(description).getContent();
  
  MailApp.sendEmail(recipient, subject, body, {htmlBody:output});
}