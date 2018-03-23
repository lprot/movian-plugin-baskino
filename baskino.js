/**
 * Baskino plugin for Movian Media Center
 *
 *  Copyright (C) 2015-2018 lprot
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

var page = require('showtime/page');
var service = require('showtime/service');
var settings = require('showtime/settings');
var http = require('showtime/http');
var misc = require('native/misc');
var string = require('native/string');
var popup = require('native/popup');
var io = require('native/io');
var plugin = JSON.parse(Plugin.manifest);
var logo = Plugin.path + plugin.icon;

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.84 Safari/537.36';

RichText = function(x) {
    this.str = x.toString();
}

RichText.prototype.toRichString = function(x) {
    return this.str;
}

var cryptodigest = function(algo, str) {
    var crypto = require('native/crypto');
    var hash = crypto.hashCreate(algo);
    crypto.hashUpdate(hash, str);
    var digest = crypto.hashFinalize(hash);
    return Duktape.enc('hex', digest);
}

function unhash(hash, hash1, hash2) {
    hash = "" + hash;
    for (var i = 0; i < hash1.length; i++) {
        hash = hash.split(hash1[i]).join('--');
        hash = hash.split(hash2[i]).join(hash1[i]);
        hash = hash.split('--').join(hash2[i]);
    }
    return Duktape.dec('base64', hash);
}

var blue = '6699CC', orange = 'FFA500', red = 'EE0000', green = '008B45';
function coloredStr(str, color) {
    return '<font color="' + color + '">' + str + '</font>';
}

function setPageHeader(page, title) {
    if (page.metadata) {
        page.metadata.title = string.entityDecode(unescape(title));
        page.metadata.logo = logo;
    }
    page.type = "directory";
    page.contents = "items";
    page.loading = false;
}

function trim(s) {
    return s.replace(/(\r\n|\n|\r)/gm, "").replace(/(^\s*)|(\s*$)/gi, "").replace(/[ ]{2,}/gi, " ");
}

service.create(plugin.title, plugin.id + ":start", 'video', true, logo);

settings.globalSettings(plugin.id, plugin.title, logo, plugin.synopsis);
settings.createString('baseURL', "Base URL without '/' at the end", 'http://baskino.co', function(v) {
    service.baseURL = v;
});
settings.createBool('debug', 'Enable debug logging',  false, function(v) {
    service.debug = v;
});
settings.createString('UA', 'User-Agent',  'Mozilla/5.0 (Windows NT 6.1; rv:54.0) Gecko/20100101 Firefox/54.0', function(v) {
    service.UA = v;
});
settings.createString('platform', 'Platform',  'Win32', function(v) {
    service.platform = v;
});

function cryptodigest(algo, str) {
    var crypto = require('native/crypto');
    var hash = crypto.hashCreate(algo);
    crypto.hashUpdate(hash, str);
    return Duktape.enc('hex', crypto.hashFinalize(hash));
}

function log(str) {
    if (service.debug) console.log(str);
}

/// MurmurHash3 related functions

// Given two 64bit ints (as an array of two 32bit ints) returns the two
// added together as a 64bit int (as an array of two 32bit ints).
function x64Add(m, n) {
    m = [m[0] >>> 16, m[0] & 0xffff, m[1] >>> 16, m[1] & 0xffff];
    n = [n[0] >>> 16, n[0] & 0xffff, n[1] >>> 16, n[1] & 0xffff];
    var o = [0, 0, 0, 0];
    o[3] += m[3] + n[3];
    o[2] += o[3] >>> 16;
    o[3] &= 0xffff;
    o[2] += m[2] + n[2];
    o[1] += o[2] >>> 16;
    o[2] &= 0xffff;
    o[1] += m[1] + n[1];
    o[0] += o[1] >>> 16;
    o[1] &= 0xffff;
    o[0] += m[0] + n[0];
    o[0] &= 0xffff;
    return [(o[0] << 16) | o[1], (o[2] << 16) | o[3]];
}

// Given two 64bit ints (as an array of two 32bit ints) returns the two
// multiplied together as a 64bit int (as an array of two 32bit ints).
function x64Multiply(m, n) {
    m = [m[0] >>> 16, m[0] & 0xffff, m[1] >>> 16, m[1] & 0xffff];
    n = [n[0] >>> 16, n[0] & 0xffff, n[1] >>> 16, n[1] & 0xffff];
    var o = [0, 0, 0, 0];
    o[3] += m[3] * n[3];
    o[2] += o[3] >>> 16;
    o[3] &= 0xffff;
    o[2] += m[2] * n[3];
    o[1] += o[2] >>> 16;
    o[2] &= 0xffff;
    o[2] += m[3] * n[2];
    o[1] += o[2] >>> 16;
    o[2] &= 0xffff;
    o[1] += m[1] * n[3];
    o[0] += o[1] >>> 16;
    o[1] &= 0xffff;
    o[1] += m[2] * n[2];
    o[0] += o[1] >>> 16;
    o[1] &= 0xffff;
    o[1] += m[3] * n[1];
    o[0] += o[1] >>> 16;
    o[1] &= 0xffff;
    o[0] += (m[0] * n[3]) + (m[1] * n[2]) + (m[2] * n[1]) + (m[3] * n[0]);
    o[0] &= 0xffff;
    return [(o[0] << 16) | o[1], (o[2] << 16) | o[3]];
}

// Given a 64bit int (as an array of two 32bit ints) and an int
// representing a number of bit positions, returns the 64bit int (as an
// array of two 32bit ints) rotated left by that number of positions.
function x64Rotl(m, n) {
    n %= 64;
    if (n === 32) 
        return [m[1], m[0]];
    else if (n < 32) 
        return [(m[0] << n) | (m[1] >>> (32 - n)), (m[1] << n) | (m[0] >>> (32 - n))];
    else {
        n -= 32;
        return [(m[1] << n) | (m[0] >>> (32 - n)), (m[0] << n) | (m[1] >>> (32 - n))];
    }
}

// Given a 64bit int (as an array of two 32bit ints) and an int
// representing a number of bit positions, returns the 64bit int (as an
// array of two 32bit ints) shifted left by that number of positions.
function x64LeftShift(m, n) {
    n %= 64;
    if (n === 0) 
        return m;
    else if (n < 32) 
        return [(m[0] << n) | (m[1] >>> (32 - n)), m[1] << n];
    else 
        return [m[1] << (n - 32), 0];
}

// Given two 64bit ints (as an array of two 32bit ints) returns the two
// xored together as a 64bit int (as an array of two 32bit ints).
function x64Xor(m, n) {
    return [m[0] ^ n[0], m[1] ^ n[1]];
}

// Given a block, returns murmurHash3's final x64 mix of that block.
// (`[0, h[0] >>> 1]` is a 33 bit unsigned right shift. This is the
// only place where we need to right shift 64bit ints.)
//
function x64Fmix(h) {
    h = x64Xor(h, [0, h[0] >>> 1]);
    h = x64Multiply(h, [0xff51afd7, 0xed558ccd]);
    h = x64Xor(h, [0, h[0] >>> 1]);
    h = x64Multiply(h, [0xc4ceb9fe, 0x1a85ec53]);
    h = x64Xor(h, [0, h[0] >>> 1]);
    return h;
}

// Given a string and an optional seed as an int, returns a 128 bit
// hash using the x64 flavor of MurmurHash3, as an unsigned hex.
//
function x64hash128(key, seed) {
    key = key || "";
    seed = seed || 0;
    var remainder = key.length % 16;
    var bytes = key.length - remainder;
    var h1 = [0, seed];
    var h2 = [0, seed];
    var k1 = [0, 0];
    var k2 = [0, 0];
    var c1 = [0x87c37b91, 0x114253d5];
    var c2 = [0x4cf5ad43, 0x2745937f];
    for (var i = 0; i < bytes; i = i + 16) {
        k1 = [((key.charCodeAt(i + 4) & 0xff)) | ((key.charCodeAt(i + 5) & 0xff) << 8) | ((key.charCodeAt(i + 6) & 0xff) << 16) | ((key.charCodeAt(i + 7) & 0xff) << 24), ((key.charCodeAt(i) & 0xff)) | ((key.charCodeAt(i + 1) & 0xff) << 8) | ((key.charCodeAt(i + 2) & 0xff) << 16) | ((key.charCodeAt(i + 3) & 0xff) << 24)];
        k2 = [((key.charCodeAt(i + 12) & 0xff)) | ((key.charCodeAt(i + 13) & 0xff) << 8) | ((key.charCodeAt(i + 14) & 0xff) << 16) | ((key.charCodeAt(i + 15) & 0xff) << 24), ((key.charCodeAt(i + 8) & 0xff)) | ((key.charCodeAt(i + 9) & 0xff) << 8) | ((key.charCodeAt(i + 10) & 0xff) << 16) | ((key.charCodeAt(i + 11) & 0xff) << 24)];
        k1 = x64Multiply(k1, c1);
        k1 = x64Rotl(k1, 31);
        k1 = x64Multiply(k1, c2);
        h1 = x64Xor(h1, k1);
        h1 = x64Rotl(h1, 27);
        h1 = x64Add(h1, h2);
        h1 = x64Add(x64Multiply(h1, [0, 5]), [0, 0x52dce729]);
        k2 = x64Multiply(k2, c2);
        k2 = x64Rotl(k2, 33);
        k2 = x64Multiply(k2, c1);
        h2 = x64Xor(h2, k2);
        h2 = x64Rotl(h2, 31);
        h2 = x64Add(h2, h1);
        h2 = x64Add(x64Multiply(h2, [0, 5]), [0, 0x38495ab5]);
    }
    k1 = [0, 0];
    k2 = [0, 0];
    switch(remainder) {
        case 15:
          k2 = x64Xor(k2, x64LeftShift([0, key.charCodeAt(i + 14)], 48));
        case 14:
          k2 = x64Xor(k2, x64LeftShift([0, key.charCodeAt(i + 13)], 40));
        case 13:
          k2 = x64Xor(k2, x64LeftShift([0, key.charCodeAt(i + 12)], 32));
        case 12:
          k2 = x64Xor(k2, x64LeftShift([0, key.charCodeAt(i + 11)], 24));
        case 11:
          k2 = x64Xor(k2, x64LeftShift([0, key.charCodeAt(i + 10)], 16));
        case 10:
          k2 = x64Xor(k2, x64LeftShift([0, key.charCodeAt(i + 9)], 8));
        case 9:
          k2 = x64Xor(k2, [0, key.charCodeAt(i + 8)]);
          k2 = x64Multiply(k2, c2);
          k2 = x64Rotl(k2, 33);
          k2 = x64Multiply(k2, c1);
          h2 = x64Xor(h2, k2);
        case 8:
          k1 = x64Xor(k1, x64LeftShift([0, key.charCodeAt(i + 7)], 56));
        case 7:
          k1 = x64Xor(k1, x64LeftShift([0, key.charCodeAt(i + 6)], 48));
        case 6:
          k1 = x64Xor(k1, x64LeftShift([0, key.charCodeAt(i + 5)], 40));
        case 5:
          k1 = x64Xor(k1, x64LeftShift([0, key.charCodeAt(i + 4)], 32));
        case 4:
          k1 = x64Xor(k1, x64LeftShift([0, key.charCodeAt(i + 3)], 24));
        case 3:
          k1 = x64Xor(k1, x64LeftShift([0, key.charCodeAt(i + 2)], 16));
        case 2:
          k1 = x64Xor(k1, x64LeftShift([0, key.charCodeAt(i + 1)], 8));
        case 1:
          k1 = x64Xor(k1, [0, key.charCodeAt(i)]);
          k1 = x64Multiply(k1, c1);
          k1 = x64Rotl(k1, 31);
          k1 = x64Multiply(k1, c2);
          h1 = x64Xor(h1, k1);
    }
    h1 = x64Xor(h1, [0, key.length]);
    h2 = x64Xor(h2, [0, key.length]);
    h1 = x64Add(h1, h2);
    h2 = x64Add(h2, h1);
    h1 = x64Fmix(h1);
    h2 = x64Fmix(h2);
    h1 = x64Add(h1, h2);
    h2 = x64Add(h2, h1);
    return ("00000000" + (h1[0] >>> 0).toString(16)).slice(-8) + ("00000000" + (h1[1] >>> 0).toString(16)).slice(-8) + ("00000000" + (h2[0] >>> 0).toString(16)).slice(-8) + ("00000000" + (h2[1] >>> 0).toString(16)).slice(-8);
}

// Top-250
new page.Route(plugin.id + ":top", function(page) {
    setPageHeader(page, plugin.title + ' / Топ 250');
    page.loading = true;
    var response = http.request(service.baseURL + '/top/').toString();
    response = response.match(/<ul class="content_list_top"[\S\s]*?<\/ul>/);
    // 1-link, 2-number, 3-title, 4-year, 5-rating
    var re = /<a href="([\S\s]*?)">[\S\s]*?<b>([\S\s]*?)<\/b>[\S\s]*?<s>([\S\s]*?)<\/s>[\S\s]*?<em>([\S\s]*?)<\/em>[\S\s]*?<u>([\S\s]*?)<\/u>/g;
    var match = re.exec(response);
    while (match) {
        page.appendItem(plugin.id + ':index:' + escape(match[1]), 'video', {
            title: new RichText(match[3] + ' ' + coloredStr(match[4], orange)),
            rating: match[5].replace(',', '.') * 10
        });
        match = re.exec(response);
    };
    page.loading = false;
});

function scrapePageAtURL(page, url, title, query) {
    setPageHeader(page, title);
    page.entries = 0;
    var p = 1,
        tryToSearch = true;

    function loader() {
        if (!tryToSearch) return false;
        page.loading = true;
        if (query)
            var response = http.request(service.baseURL + url, {
                postdata: {
                    subaction: 'search',
                    actors_only: 0,
                    search_start: p,
                    full_search: 0,
                    result_from: 1,
                    result_from: 1,
                    story: query
                }
            }).toString();
        else
            var response = http.request((url.substr(0, 4) == 'http' ? '' : service.baseURL) + unescape(url) + "/page/" + p + "/").toString();
        
        // 1-link, 2-title, 3-icon, 4-quality, 5-full title,
        // 6-rating, 7-num of comments, 8-date added, 9-year
        var re = /<div class="postcover">[\S\s]*?<a href="([\S\s]*?)"[\S\s]*?<img title="([\S\s]*?)" src="([\S\s]*?)"([\S\s]*?)<\/a>[\S\s]*?<div class="posttitle">[\S\s]*?>([\S\s]*?)<\/a>[\S\s]*?<li class="current-rating" style="[\S\s]*?">([\S\s]*?)<\/li>[\S\s]*?<!-- <div class="linline">([\S\s]*?)<\/div>[\S\s]*?<div class="linline">([\S\s]*?)<\/div>[\S\s]*?<div class="rinline">([\S\s]*?)<\/div>/g;
        var match = re.exec(response);
        while (match) {
            page.appendItem(plugin.id + ':index:' + escape(match[1]), 'video', {
                title: new RichText((match[4].match(/quality_hd/) ? coloredStr("HD", orange) : coloredStr("DVD", orange)) + ' ' + match[5]),
                rating: +(match[6]) / 2,
                icon: checkUrl(match[3]),
                year: match[9].match(/(\d+)/) ? +match[9].match(/(\d+)/)[1] : '',
                tagline: new RichText((match[9].match(/<span class="tvs_new">(.*)<\/span>/) ? match[9].match(/<span class="tvs_new">(.*)<\/span>/)[1] + ' ' : '') + 
                    coloredStr('Добавлено: ', orange) + match[8] +
                    (match[7].match(/(\d+)/) ? coloredStr(' Комментариев: ', orange) + match[7].match(/(\d+)/)[1] : ''))
            });
            page.entries++;
            match = re.exec(response);
        };
        page.loading = false;
        if (!response.match(/<div class="navigation">/) || response.match(/<span>Вперед<\/span>/))
            return tryToSearch = false;
        p++;
        return true;
    };
    for (var i = 0; i < 5; i++) // fixing broken paginator
        loader();
    page.paginator = loader;
    page.loading = false;
};

new page.Route(plugin.id + ":indexURL:(.*):(.*)", function(page, url, title) {
    scrapePageAtURL(page, url, plugin.title + ' / ' + unescape(title));
});

new page.Route(plugin.id + ":movies", function(page) {
    setPageHeader(page, plugin.title + ' / Фильмы');
    page.loading = true;
    var response = http.request(service.baseURL).toString();
    response = response.match(/<ul class="sf-menu">([\s\S]*?)<\/ul>/)[1];
    var re = /<li><a href="([\s\S]*?)">([\s\S]*?)</g;
    var match = re.exec(response);
    while (match) {
        page.appendItem(plugin.id + ":indexURL:" + match[1] + ':' + escape(match[2]), 'directory', {
            title: new RichText(match[2])
        });
        match = re.exec(response);
    };
    page.loading = false;
});

// Search IMDB ID by title
function getIMDBid(title) {
    var imdbid = null;
    var title = string.entityDecode(unescape(title)).toString();
    log('Splitting the title for IMDB ID request: ' + title);
    var splittedTitle = title.split('|');
    if (splittedTitle.length == 1)
        splittedTitle = title.split('/');
    if (splittedTitle.length == 1)
        splittedTitle = title.split('-');
    log('Splitted title is: ' + splittedTitle);
    if (splittedTitle[1]) { // first we look by original title
        var cleanTitle = splittedTitle[1];
        //var match = cleanTitle.match(/[^\(|\[|\.]*/);
        //if (match)
        //    cleanTitle = match;
        log('Trying to get IMDB ID for: ' + cleanTitle);
        resp = http.request('http://www.imdb.com/find?ref_=nv_sr_fn&q=' + encodeURIComponent(cleanTitle)).toString();
        imdbid = resp.match(/class="findResult[\s\S]*?<a href="\/title\/(tt\d+)\//);
        if (!imdbid && cleanTitle.indexOf('/') != -1) {
            splittedTitle2 = cleanTitle.split('/');
            for (var i in splittedTitle2) {
                log('Trying to get IMDB ID (1st attempt) for: ' + splittedTitle2[i].trim());
                resp = http.request('http://www.imdb.com/find?ref_=nv_sr_fn&q=' + encodeURIComponent(splittedTitle2[i].trim())).toString();
                imdbid = resp.match(/class="findResult[\s\S]*?<a href="\/title\/(tt\d+)\//);
                if (imdbid) break;
            }
        }
    }
    if (!imdbid)
        for (var i in splittedTitle) {
            if (i == 1) continue; // we already checked that
            var cleanTitle = splittedTitle[i];
            //var match = cleanTitle.match(/[^\(|\[|\.]*/);
            //if (match)
            //    cleanTitle = match;
            log('Trying to get IMDB ID (2nd attempt) for: ' + cleanTitle);
            resp = http.request('http://www.imdb.com/find?ref_=nv_sr_fn&q=' + encodeURIComponent(cleanTitle)).toString();
            imdbid = resp.match(/class="findResult[\s\S]*?<a href="\/title\/(tt\d+)\//);
            if (imdbid) break;
        }
    if (imdbid) {
        log('Got following IMDB ID: ' + imdbid[1]);
        return imdbid[1];
    }
    log('Cannot get IMDB ID :(');
    return imdbid;
};

//Play vkino links
new page.Route(plugin.id + ":vki:(.*):(.*)", function(page, url, title) {
    page.loading = true;
    var doc = http.request(unescape(url)).toString();
    var params = doc.match(/load_vk_video\((.*), (.*), '(.*)'/);
    if (params) {
        doc = http.request('http://api.vk.com/method/video.getEmbed', {
            args: {
                oid: params[1],
                video_id: params[2],
                embed_hash: params[3]
            }
        });
        doc = JSON.parse(doc);
        var link = null;
        var link = doc.response.url720;
        if (!link)
            link = doc.response.url480;
        if (!link)
            link = doc.response.url360;
        if (!link)
            link = doc.response.url240;
    }
    if (!params) params = doc.match(/file:"(.*)"/);
    if (params) link = params[1];
    if (link) {
        page.type = 'video';
        var series = unescape(title).trim().split(String.fromCharCode(8194));
        var season = null,
            episode = null;
        if (series[1]) {
            series = series[1].split('-');
            season = +series[0].match(/(\d+)/)[1];
            episode = +series[1].match(/(\d+)/)[1];
        }
        page.source = "videoparams:" + JSON.stringify({
            title: unescape(title),
            imdbid: getIMDBid(unescape(title)),
            season: season,
            episode: episode,
            canonicalUrl: plugin.id + ':vki:' + url + ':' + title,
            sources: [{
                url: link
            }]
        });
    } else {
        page.error("Не удалось получить видеолинк. / Can't get video link, sorry :(");
        return;
    }
    page.loading = false;
});

//Play vk* links
new page.Route(plugin.id + ":vk:(.*):(.*)", function(page, url, title) {
    page.loading = true;
    var response = http.request(unescape(url)).toString();
    var link = response.match(/url720=(.*?)&/);
    if (!link)
        link = response.match(/url480=(.*?)&/);
    if (!link)
        link = response.match(/url360=(.*?)&/);
    if (!link)
        link = response.match(/url240=(.*?)&/);
    page.loading = false;
    if (!link) {
        page.error('Видео не доступно. / This video is not available, sorry :(');
        return;
    }
    page.type = "video";
    var series = unescape(title).trim().split(String.fromCharCode(8194));
    var season = null,
        episode = null;
    if (series[1]) {
        series = series[1].split('-');
        season = +series[0].match(/(\d+)/)[1];
        episode = +series[1].match(/(\d+)/)[1];
    }
    page.source = "videoparams:" + JSON.stringify({
        title: unescape(title),
        imdbid: getIMDBid(unescape(title)),
        season: season,
        episode: episode,
        canonicalUrl: plugin.id + ':vk:' + url + ':' + title,
        sources: [{
            url: link[1]
        }]
    });
    page.loading = false;
});

//Play bk.com links
new page.Route(plugin.id + ":bk:(.*):(.*)", function(page, url, title) {
    page.loading = true;
    page.type = "video";
    var series = unescape(title).trim().split(String.fromCharCode(8194));
    var season = null,
        episode = null;
    if (series[1]) {
        series = series[1].split('-');
        season = +series[0].match(/(\d+)/)[1];
        episode = +series[1].match(/(\d+)/)[1];
    }
    page.source = "videoparams:" + JSON.stringify({
        title: unescape(title),
        imdbid: getIMDBid(unescape(title)),
        season: season,
        episode: episode,
        canonicalUrl: plugin.id + ':bk:' + url + ':' + title,
        sources: [{
            url: unescape(url)
        }]
    });
    page.loading = false;
});

//Play kinostok.tv links
new page.Route(plugin.id + ":kinostok:(.*):(.*)", function(page, url, title) {
    var hash1 = "Ddaf4bI7i6XeRNZ3ToJcHmlv5E",
        hash2 = "YWyzpnxMu90Ltwk2GUQBsV81g=";

    url = unescape(url).match(/value="pl=c:(.*?)&amp;/)[1];
    page.loading = true;
    var v = http.request('http://kinostok.tv/embed' + unhash(url, hash1, hash2).match(/_video\/.*\//));
    page.type = "video";
    var series = unescape(title).trim().split(String.fromCharCode(8194));
    var season = null,
        episode = null;
    if (series[1]) {
        series = series[1].split('-');
        season = +series[0].match(/(\d+)/)[1];
        episode = +series[1].match(/(\d+)/)[1];
    }
    page.source = "videoparams:" + JSON.stringify({
        title: unescape(title),
        imdbid: getIMDBid(unescape(title)),
        season: season,
        episode: episode,
        sources: [{
            url: JSON.parse(unhash(v, hash1, hash2)).playlist[0].file
        }]
    });
    page.loading = false;
});

//Play meta.ua links
new page.Route(plugin.id + ":metaua:(.*):(.*)", function(page, url, title) {
    var hash1 = "N3wxDvVdIbop1c5eiYZaWL6tnq",
        hash2 = "JBmX0z4T9gkMGRy7l8sUHfu2Q=";
    page.loading = true;
    var v = http.request('http://media.meta.ua/players/getparam/?v=' + unescape(unescape(url).match(/value="fileID=(.*?)&/)[1]));
    page.type = "video";
    var series = unescape(title).trim().split(String.fromCharCode(8194));
    var season = null,
        episode = null;
    if (series[1]) {
        series = series[1].split('-');
        season = +series[0].match(/(\d+)/)[1];
        episode = +series[1].match(/(\d+)/)[1];
    }
    page.source = "videoparams:" + JSON.stringify({
        title: unescape(title),
        imdbid: getIMDBid(unescape(title)),
        season: season,
        episode: episode,
        sources: [{
            url: JSON.parse(unhash(v, hash1, hash2))
        }]
    });
    page.loading = false;
});

//Play arm-tube.am links
new page.Route(plugin.id + ":armtube:(.*):(.*)", function(page, url, title) {
    var hash1 = "kVI7xeanT6ispD9l3HfGYvgBcE",
        hash2 = "XU2R1bWow0Mm4JtQy8zuNdZL5=";

    url = unescape(url).match(/;file=(.*?)&amp;/)[1];
    page.loading = true;
    page.type = "video";
    var series = unescape(title).trim().split(String.fromCharCode(8194));
    var season = null,
        episode = null;
    if (series[1]) {
        series = series[1].split('-');
        season = +series[0].match(/(\d+)/)[1];
        episode = +series[1].match(/(\d+)/)[1];
    }
    page.source = "videoparams:" + JSON.stringify({
        title: unescape(title),
        imdbid: getIMDBid(unescape(title)),
        season: season,
        episode: episode,
        sources: [{
            url: "hls:" + unhash(url, hash1, hash2).replace('manifest.f4m', 'master.m3u8')
        }]
    });
    page.loading = false;
});

//Play HDSerials/moonwalk/serpens links
new page.Route(plugin.id + ":moonwalk:(.*):(.*)", function(page, url, title) {
    page.loading = true;
    var html = http.request(unescape(url)).toString();
    var link = JSON.parse(http.request('http://moonwalk.cc/sessions/create_session', {
        postdata: {
            'video_token': html.match(/video_token: '([\s\S]*?)'/)[1],
            'access_key': html.match(/access_key: '([\s\S]*?)'/)[1]
        }
    }));
    link = 'hls:' + link['manifest_m3u8']
    page.type = "video";
    var series = unescape(title).trim().split(String.fromCharCode(8194));
    var season = null,
        episode = null;
    if (series[1]) {
        series = series[1].split('-');
        season = +series[0].match(/(\d+)/)[1];
        episode = +series[1].match(/(\d+)/)[1];
    }
    page.source = "videoparams:" + JSON.stringify({
        title: unescape(title),
        imdbid: getIMDBid(unescape(title)),
        season: season,
        episode: episode,
        canonicalUrl: plugin.id + ':moonwalk:' + url + ':' + title,
        sources: [{
            url: link
        }]
    });
    page.loading = false;
});


//Play Rutube links
new page.Route(plugin.id + ":rutube:(.*):(.*)", function(page, url, title) {
    page.loading = true;
    var html = http.request(unescape(url)).toString();
    var link = html.match(/"m3u8": "([\s\S]*?)"\}/);
    if (!link) {
        page.loading = false;
        page.error('Видео удалено Администрацией RuTube');
        return;
    }
    page.type = "video";
    var series = unescape(title).trim().split(String.fromCharCode(8194));
    var season = null,
        episode = null;
    if (series[1]) {
        series = series[1].split('-');
        season = +series[0].match(/(\d+)/)[1];
        episode = +series[1].match(/(\d+)/)[1];
    }
    page.source = "videoparams:" + JSON.stringify({
        title: unescape(title),
        imdbid: getIMDBid(unescape(title)),
        season: season,
        episode: episode,
        sources: [{
            url: 'hls:' + link[1]
        }]
    });
    page.loading = false;
});

// Play hdgo links
new page.Route(plugin.id + ":hdgo:(.*):(.*)", function(page, url, title) {
    page.loading = true;
    var doc = http.request(unescape(url)).toString();
    page.type = "video";
    var series = unescape(title).trim().split(String.fromCharCode(8194));
    var season = null,
        episode = null;
    if (series[1]) {
        series = series[1].split('-');
        season = +series[0].match(/(\d+)/)[1];
        episode = +series[1].match(/(\d+)/)[1];
    }
    page.source = "videoparams:" + JSON.stringify({
        title: unescape(title),
        imdbid: getIMDBid(unescape(title)),
        season: season,
        episode: episode,
        canonicalUrl: plugin.id + ":hdgo:" + url + ':' + title,
        sources: [{
            url: doc.match(/<source src="([\s\S]*?)"/)[1]
        }]
    });
    page.loading = false;
});

var md5 = cryptodigest('md5', misc.systemIpAddress() + Core.currentVersionString);
var x = 1920 - parseInt(md5[30] + md5[31], 16);
var y = 1080 - parseInt(md5[28] + md5[29], 16)
var keys = '[{"key":"user_agent","value":"' + service.UA + '"},{"key":"language","value":"en-US"},{"key":"color_depth","value":24},{"key":"pixel_ratio","value":1},{"key":"hardware_concurrency","value":2},{"key":"resolution","value":['+x+','+y+']},{"key":"available_resolution","value":['+x+','+y+']},{"key":"timezone_offset","value":0},{"key":"session_storage","value":1},{"key":"local_storage","value":1},{"key":"indexed_db","value":1},{"key":"open_database","value":1},{"key":"cpu_class","value":"unknown"},{"key":"navigator_platform","value":"'+service.platform+'"},{"key":"do_not_track","value":"unknown"},{"key":"regular_plugins","value":"undefined"},{"key":"canvas","value":"canvas winding:yes~canvas fp:data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAB9AAAADICAYAAACwGnoBAAAH6ElEQVR4nO3ZMQEAAAiAMPuXxhh6bAn4mQAAAAAAAACA5joAAAAAAAAAAD4w0AEAAAAAAAAgAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAAKpaV/0C3qz3zKIAAAAASUVORK5CYII="},{"key":"adblock","value":false},{"key":"has_lied_languages","value":false},{"key":"has_lied_resolution","value":false},{"key":"has_lied_os","value":false},{"key":"has_lied_browser","value":false},{"key":"touch_support","value":[0,false,false]},{"key":"js_fonts","value":["Arial","Courier","Courier New","Helvetica","Times","Times New Roman"]}]';

// Play s links
new page.Route(plugin.id + ":s:(.*):(.*)", function(page, url, title) {
    page.loading = true;

    var doc = http.request(unescape(url), {
        headers: {
            Host: unescape(url).replace('http://', '').replace('https://', '').split(/[/?#]/)[0],
            Referer: 'http://baskino.co/',
            'User-Agent': UA,
            'X-Requested-With': 'XMLHttpRequest'
        }
    }).toString();

    var subtitles = 0;
    try { 
        log(doc.match(/subtitles: ([\s\S]*?)},/)[1] + '}');
        subtitles = JSON.parse(doc.match(/subtitles: ([\s\S]*?)},/)[1] + '}');
    } catch(err) {}

    var host = doc.match(/host: '([\s\S]*?)'/)[1];

    var js = http.request('http://' + host + doc.match(/<script src="([\s\S]*?)">/)[1]).toString();

    js = js.match(/mw_key:"([\s\S]*?)"[\s\S]*?partner_id,([\s\S]*?):[\s\S]*?ad_attr:([\s\S]*?),iframe_version:"([\s\S]*?)"[\s\S]*?n\.([\s\S]*?)=[\s\S]*?n\.([\s\S]*?)=/);
    var data = {
        'mw_key': js[1],
        'mw_pid': doc.match(/partner_id: ([\s\S]*?),/)[1],
        'ad_attr': js[3],
        'iframe_ver': js[4],
    };
    data[trim(js[2])] = doc.match(/domain_id: ([\s\S]*?),/)[1];
    data[trim(js[5])] = doc.match(/\] = '([\s\S]*?)'/)[1];

    var json = JSON.parse(keys);
    var values = [];
    for (var i in json) {
        var value = json[i].value;
        if (typeof json[i].value.join !== "undefined")
            value = json[i].value.join(";");
        values.push(value);
    }
    data[trim(js[6])] = x64hash128(values.join("~~~"), 31)
    
    var json = JSON.parse(http.request('http://' + host + '/manifests/video/' + doc.match(/video_token: '([\s\S]*?)'/)[1] + '/all', {
        headers: {
            Host: host,
            Referer: unescape(url),
            'User-Agent': UA,
            'X-Requested-With': 'XMLHttpRequest'
        },
        postdata: data
    }));
    io.httpInspectorCreate('.*' + host + '.*', function(req) {
        req.setHeader('User-Agent', UA);
        req.setHeader('Host', host);
        req.setHeader('Referer', unescape(url));
        req.setHeader('X-Requested-With', 'XMLHttpRequest');
    });
    var series = unescape(title).trim().split(String.fromCharCode(8194));
    var season = null,
        episode = null;
    if (series[1]) {
        series = series[1].split('-');
        season = +series[0].match(/(\d+)/)[1];
        episode = +series[1].match(/(\d+)/)[1];
    }

    var videoparams = {
        title: unescape(title),
        imdbid: getIMDBid(unescape(title)),
        season: season,
        episode: episode,
        canonicalUrl: plugin.id + ':s:' + url + ':' + title,
        sources: [{
            url: 'hls:' + json.mans.manifest_m3u8
        }],
        subtitles: []
    };

    if (subtitles.master_vtt) {
        videoparams.subtitles.push({
            url: subtitles.master_vtt,
            language: 'rus',
            source: service.baseURL,
            title: unescape(title)
        });
    };
    if (subtitles.master_vtt) {
        videoparams.subtitles.push({
            url: subtitles.slave_vtt,
            language: 'eng',
            source: service.baseURL,
            title: unescape(title)
        });
    };
    page.source = "videoparams:" + JSON.stringify(videoparams);
    page.type = "video";
    page.loading = false;
});

new page.Route(plugin.id + ":listSeries:(.*):(.*):(.*)", function(page, url, title, titleForSubs) {
    setPageHeader(page, unescape(titleForSubs + ') ' + title));
    page.loading = true;
    var lnk = unescape(url);
    var host = lnk.replace('http://', '').replace('https://', '').split(/[/?#]/)[0];
    var doc = http.request(lnk, {
        headers: {
            Host: host,
            Referer: 'http://baskino.co/',
            'User-Agent': UA,
            'X-Requested-With': 'XMLHttpRequest'
        }
    }).toString();
    log(doc);
    try {
        eval('var episodes =' + doc.match(/episodes: ([\s\S]*?)\],/)[1]+']');
        for (var i in episodes) {
            page.appendItem(plugin.id + ':s:' + lnk + escape('&episode=' + episodes[i]) + ":" + titleForSubs + escape(' - ' + episodes[i] + ' cерия)') + title, 'video', {
                title: episodes[i] + ' cерия'
            });
        }
    } catch(err) {}
    page.loading = false;
});


var linksBlob = 0;

new page.Route(plugin.id + ":indexSeason:(.*):(.*):(.*)", function(page, title, episode, url) {
    setPageHeader(page, decodeURIComponent(title) + ')');
    page.loading = true;
    if (!linksBlob)
        linksBlob = http.request(unescape(url)).toString();
    var links = linksBlob.match(/tvs_codes = ([\S\s]*?);/);
    if (links) {
        var json = JSON.parse(links[1]);

        // 1 - episode number, 2 - blob
        re = /<div id="episodes-([0-9]+)"([\S\s]*?)<\/div>/g;
        var episodeDiv = re.exec(linksBlob);
        while (episodeDiv) { // go by episodes
            if (episodeDiv[1] == episode) {
                // 1 - url, 2 - num of series
                re2 = /<span onclick="showCode\(([0-9]+),this\);">([\S\s]*?)<\/span>/g;
                var series = re2.exec(episodeDiv[2]);
                while (series) {
                    if (json[1].match(/vkino/)) {
                        var lnk = json[+series[1]].match(/<iframe src="([\S\s]*?)"/)[1];
                        page.appendItem(plugin.id + ':vki:' + escape(lnk) + ":" + escape(decodeURIComponent(title) + ' - ' + series[2] + ')'), 'video', {
                            title: series[2]
                        });
                    } else { // new moonwalk
                        var lnk = json[+series[1]].match(/src="([\S\s]*?)"/)[1];
                        var host = lnk.replace('http://', '').replace('https://', '').split(/[/?#]/)[0];
                        var doc = http.request(lnk, {
                            headers: {
                                Host: host,
                                Referer: 'http://baskino.co/',
                                'User-Agent': UA,
                                'X-Requested-With': 'XMLHttpRequest'
                            }
                        }).toString();
                        try {
                            eval('var translations =' + doc.match(/translations: ([\s\S]*?)\]\],/)[1]+']]');
                            for (var i in translations)
                                page.appendItem(plugin.id + ':listSeries:' + escape('http://' + host + '/serial/' + translations[i][0] + '/iframe?season=' + episode) + ':' + escape(translations[i][1]) + ':' + escape(decodeURIComponent(title)), 'directory', {
                                    title: translations[i][1]
                                });
                        } catch(err) {
                           try {
                               eval('var episodes =' + doc.match(/episodes: ([\s\S]*?)\],/)[1]+']');
                               for (var i in episodes) {
                                   page.appendItem(plugin.id + ':s:' + lnk + escape('&episode=' + episodes[i]) + ":" + escape(decodeURIComponent(title) + ' - ' + episodes[i] + ' cерия)'), 'video', {
                                       title: episodes[i] + ' cерия'
                                   });
                               }
                           } catch(err) {
                               log(doc);
                           }
                        }
                    }
                    series = re2.exec(episodeDiv[2]);
                }
                break;
            }
            episodeDiv = re.exec(linksBlob);
        }
    } else {
        page.error("Не удалось получить линки серий :(");
        return;
    }
    page.loading = false;
});

// Index page
new page.Route(plugin.id + ":index:(.*)", function(page, url) {
    page.loading = true;
    var response = http.request(unescape(url)).toString();
    var description = new RichText(trim(response.match(/<div class="description"[\S\s]*?<div id="[\S\s]*?">([\S\s]*?)<br\s\/>/)[1]));
    var name = response.match(/<td itemprop="name">([\S\s]*?)<\/td>/)[1];
    var origTitle = response.match(/<td itemprop="alternativeHeadline">([\S\s]*?)<\/td>/);
    if (origTitle) name += " | " + origTitle[1];
    page.metadata.glwview = Plugin.path + 'list.view';
    setPageHeader(page, name);
    page.loading = true;
    var icon = page.metadata.logo = checkUrl(response.match(/<img itemprop="image"[\S\s]*?src="([\S\s]*?)"/)[1]);
    var year = response.match(/>Год:<\/td>[\S\s]*?<a href="([\S\s]*?)">([\S\s]*?)<\/a>/);
    var country = response.match(/>Страна:<\/td>[\S\s]*?<td>([\S\s]*?)<\/td>/)[1];
    var slogan = response.match(/>Слоган:<\/td>[\S\s]*?<td>([\S\s]*?)<\/td>/)
    if (slogan) slogan = slogan[1];
    var duration = response.match(/<td itemprop="duration">([\S\s]*?)<\/td>/);
    if (duration) duration = trim(duration[1].replace(/\-/g, ''));
    var rating = response.match(/<b itemprop="ratingValue">([\S\s]*?)<\/b>/)[1].replace(",", ".") * 10;
    var directors = response.match(/<a itemprop="director"([\S\s]*?)<\/td>/)[1];
    var timestamp = response.match(/<div class="last_episode">([\S\s]*?)<\/div>/);
    var genres = response.match(/<a itemprop="genre"([\S\s]*?)<\/td>/)[1];
    var re = /href="[\S\s]*?">([\S\s]*?)<\/a>/g;
    var genre = 0;
    var match = re.exec(genres);
    while (match) {
        if (!genre) genre = match[1];
        else genre += ", " + match[1];
        match = re.exec(genres);
    };

    genre = new RichText(genre + ' ' + coloredStr('<br>Cтрана: ', orange) + country +
         (trim(slogan) != '-' && trim(slogan) ? coloredStr("<br>Слоган: ", orange) + slogan : ''))

    function addTrailer() { //trailer
        var html = response.match(/<span class="trailer_link">[\S\s]*?src="([\S\s]*?)"/);
        if (html) {
            var id = html[1].replace(/\\/g, '');
            page.appendItem('youtube:video:' + id.substr(id.lastIndexOf('/') + 1), 'video', {
                title: 'Трейлер',
                icon: icon,
                year: +year[2],
                genre: genre,
                duration: duration,
                rating: rating,
                description: description
            });
        }
    }

    if (timestamp) { // series
        page.appendItem(icon, 'video', {
            title: name,
            icon: icon,
            year: +year[2],
            genre: genre,
            duration: duration,
            rating: rating,
            tagline: timestamp[1],
            description: description
        });
        addTrailer();
        linksBlob = response;
        re = /"showEpisodes\(([0-9]+),this\);">([\S\s]*?)<\/span>/g;
        match = re.exec(response);
        while (match) {
            page.appendItem(plugin.id + ":indexSeason:" + encodeURIComponent(name + String.fromCharCode(8194) + '(' + match[2]) + ':' + match[1] + ':' + url, 'directory', {
                title: match[2]
            });
            match = re.exec(response);
        };																	
    } else { // movie
        //1-player's name, 2-blob with iframe
        re = /id="basplayer_([\s\S]*?)"([\s\S]*?)<\/div>/g;
        match = re.exec(response);
        while (match) {
            if (!match[2].match(/<iframe src="([\s\S]*?)"/)) {
                match = re.exec(response);
                continue;
            }
            var iframe = match[2].match(/<iframe src="([\s\S]*?)"/)[1];
            var link = iframe.match(/(http:\/\/s.*)/);
            if (link)
                link = plugin.id + ":s:" + escape(link[1]) + ":" + escape(name);
            if (!link) {
                link = iframe.match(/(http:\/\/vki.*)/);
                if (link)
                     link = plugin.id + ":hdgo:" + escape(link[1]) + ":" + escape(name);
            }
            if (!link) {
                link = iframe.match(/(http:\/\/vk.*)/);
                if (link)
                    link = plugin.id + ":vk:" + escape(link[1]) + ":" + escape(name);
            }
            if (!link) {
                link = iframe.match(/(https:\/\/vk.*?)/);
                if (link)
                    link = plugin.id + ":vk:" + escape(link[1]) + ":" + escape(name);
            }
            if (!link) {
                link = iframe.match(/(http:\/\/moonwalk.*)/);
                if (link)
                    link = plugin.id + ":moonwalk:" + escape(link[1]) + ":" + escape(name);
            }
            if (!link) {
                link = iframe.match(/(http:\/\/hdgo.*)/);
                if (link)
                    link = plugin.id + ":hdgo:" + escape(link[1]) + ":" + escape(name);
            }
            if (link) {
                page.appendItem(link, 'video', {
                    title: new RichText(coloredStr(match[1].replace('html5', 'sd'), orange) + ' ' + name),
                    icon: icon,
                    year: +year[2],
                    genre: genre,
                    duration: duration,
                    rating: rating,
                    description: description
                });
            }
            match = re.exec(response);
        };
        if (link) duration = void(0);
        addTrailer();
        // cover
        page.appendItem(icon, 'image', {
            title: 'Обложка',
            icon: icon
        });
    };

    //year
    page.appendItem("", "separator", {
        title: 'Год:'
    });
    page.appendItem(plugin.id + ":indexURL:" + escape(year[1]) + ':Год', 'directory', {
        title: year[2]
    });

    //collections
    var first = true;
    var collections = response.match(/>Цикл:<([\S\s]*?)<\/td>/);
    if (collections) {
        re = /<a href="([\S\s]*?)">([\S\s]*?)<\/a>/g;
        html = re.exec(collections[1]);
        while (html) {
            if (first) {
                page.appendItem("", "separator", {
                    title: 'Цикл:'
                });
                first = false;
            }
            page.appendItem(plugin.id + ":indexURL:" + escape(html[1]) + ':' + escape(html[2]), 'directory', {
                title: html[2]
            });
            html = re.exec(collections[1]);
        };
    };

    // genres
    page.appendItem("", "separator", {
        title: 'Жанры:'
    });
    re = /href="([\S\s]*?)">([\S\s]*?)<\/a>/g;
    html = re.exec(genres);
    while (html) {
        page.appendItem(plugin.id + ":indexURL:" + escape(html[1]) + ':' + escape(html[2]), 'directory', {
            title: html[2]
        });
        html = re.exec(genres);
    };

    //directors
    page.appendItem("", "separator", {
        title: 'Режиссеры:'
    });
    re = /href="([\S\s]*?)">([\S\s]*?)<\/a>/g;
    html = re.exec(directors);
    while (html) {
        page.appendItem(plugin.id + ":indexURL:" + escape(html[1]) + ':' + escape(html[2]), 'directory', {
            title: html[2]
        });
        html = re.exec(directors);
    }

    //actors
    var actors = response.match(/"post-actors-list">([\S\s]*?)<\/td>/);
    if (actors) {
        page.appendItem("", "separator", {
            title: 'В ролях:'
        });
        re = /data\-person="([\S\s]*?)" href="([\S\s]*?)"/g;
        html = re.exec(actors);
        while (html) {
            var json = JSON.parse(http.request(service.baseURL + '/engine/ajax/getActorData.php?name=' + encodeURIComponent(html[1])));
            page.appendItem(plugin.id + ":indexURL:" + escape(html[2]) + ':' + escape(html[1]), 'video', {
                title: html[1],
                icon: json.image
            });
            html = re.exec(actors);
        };
    }

    //related
    html = response.match(/<div class="related_news">([\S\s]*?)<\/li><\/ul>/);
    if (html) {
        html = html[1];
        page.appendItem("", "separator", {
            title: html.match(/<div class="mbastitle">([\S\s]*?)<\/div>/)[1]
        });
        // 1 - link, 2 - icon, 3 - title, 4 - quality
        re = /<a href="([\S\s]*?)"><img src="([\S\s]*?)"[\S\s]*?\/><span>([\S\s]*?)<\/span>[\S\s]*?class="quality_type ([\S\s]*?)">/g;
        match = re.exec(html);
        while (match) {
            page.appendItem(plugin.id + ":index:" + escape(match[1]), 'video', {
                title: new RichText((match[4] == "quality_hd" ? coloredStr("HD", orange) : coloredStr("DVD", orange)) + ' ' + match[3]),
                icon: checkUrl(match[2])
            });
            match = re.exec(html);
        };
    }

    //comments
    var tryToSearch = true,
        first = true;

    function loader() {
        if (!tryToSearch) return false;
        html = response.match(/<div id="dle-ajax-comments">([\S\s]*?)<\/form>/);
        if (!html) return tryToSearch = false;
        // 1-user+added, 2-icon, 3-comment
        re = /<div class="linline author">([\S\s]*?)<div class="rinline acts">[\S\s]*?<img src="([\S\s]*?)"[\S\s]*?<div id='[\S\s]*?'>([\S\s]*?)<\/div>/g;
        match = re.exec(html[1]);
        while (match) {
            if (first) {
                page.appendItem("", "separator", {
                    title: response.match(/<div class="listcomments">[\S\s]*?<div class="mbastitle">([\S\s]*?)<\/div>/)[1]
                });
                first = false;
            }
            var author = match[1].match(/href="[\S\s]*?">([\S\s]*?)<\/a>([\S\s]*?)<\/div>/);
            var added = '';
            if (author) {
                added = author[2];
                author = author[1];
            } else {
                author = match[1].match(/[\S\s]*?<b>([\S\s]*?)<\/b>([\S\s]*?)<\/div>/);
                added = author[2];
                author = author[1];
            }
            page.appendPassiveItem('video', '', {
                title: new RichText(coloredStr(trim(author), orange) + added),
                icon: checkUrl(match[2]),
                description: new RichText(trim(match[3]))
            });
            match = re.exec(html[1]);
        };
        var next = response.match(/<div class="dle-comments-navigation">([\S\s]*?)<\/div>/);
        if (!next) return tryToSearch = false;
        next = next[1];
        if (next.match(/<span>Вперед<\/span>/)) return tryToSearch = false;
        next = next.substr(next.lastIndexOf('<a href=')).match(/<a href="([\S\s]*?)"/);
        response = http.request(next[1]).toString();
        return true;
    };
    loader();
    page.paginator = loader;
    page.loading = false;
});

function checkUrl(url) {
    return url.substr(0, 4) == 'http' ? url : service.baseURL + url
}

new page.Route(plugin.id + ":start", function(page) {
    setPageHeader(page, plugin.synopsis);
    page.loading = true;
    try {
        var response = http.request(service.baseURL).toString();
    } catch (err) {
        page.loading = false;
        page.error('Не могу открыть: ' + service.baseURL + ' Возможно интернет провайдер заблокировал к нему доступ. Сменить зеркало можно в настройках плагина.');
        return;
    }
    page.appendItem(plugin.id + ":search:", 'search', {
        title: 'Поиск в ' + service.baseURL
    });
    page.appendItem(plugin.id + ':movies', 'directory', {
        title: 'Фильмы',
    });
    page.appendItem(plugin.id + ':indexURL:/new:Новинки', 'directory', {
        title: 'Новинки',
    });
    page.appendItem(plugin.id + ':top', 'directory', {
        title: 'Топ-250',
    });
    page.appendItem(plugin.id + ':indexURL:/serial:Сериалы', 'directory', {
        title: 'Сериалы',
    });

    page.appendItem("", "separator", {
        title: 'Рекомендуемое:'
    });
    // 1 - link, 2 - title, 3 - image, 4 - regie
    var re = /<img  onclick=\(window.location.href='(.*?)'\); title="(.*?)"[\S\s]*?src="(.*?)"[\S\s]*?'\);>(.*?)<\/span>/g;
    var match = re.exec(response);
    while (match) {
        page.appendItem(plugin.id + ':index:' + escape(service.baseURL + match[1]), 'video', {
            title: new RichText(match[2]),
            icon: checkUrl(match[3]),
            genre: new RichText(coloredStr('Режиссер: ', orange) + match[4])
        });
        match = re.exec(response);
    };

    page.appendItem("", "separator", {
        title: 'Новинки:'
    });
    re = /<div class="carousel">([\S\s]*?)<\/div>/;
    var n = re.exec(response)[1];
    // 1 - link, 2 - title, 3 - image, 4 - quality
    re = /<a href="([\S\s]*?)"><img title="([\S\s]*?)" src="([\S\s]*?)"[\S\s]*?class="quality_type ([\S\s]*?)">/g;
    var match = re.exec(n);
    while (match) {
        page.appendItem(plugin.id + ':index:' + escape(service.baseURL + match[1]), 'video', {
            title: new RichText((match[4] == "quality_hd" ? coloredStr("HD", orange) : coloredStr("DVD", orange)) + ' ' + match[2]),
            icon: checkUrl(match[3])
        });
        match = re.exec(n);
    };

    page.appendItem("", "separator", {
        title: 'Фильмы онлайн:'
    });

    scrapePageAtURL(page, '', plugin.synopsis);
    page.loading = false;
});

new page.Route(plugin.id + ":search:(.*)", function(page, query) {
    scrapePageAtURL(page, '/index.php?do=search', plugin.title, query)
});
page.Searcher("baskino", logo, function(page, query) {
    scrapePageAtURL(page, '/index.php?do=search', plugin.title, query)
});
