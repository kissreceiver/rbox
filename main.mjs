const CLIENT_ID = '4SuAmyL8hg2wtuwojr7CSg';
const REDIRECT_URL = 'https://kissreceiver.github.io/rbox';
const SCOPES = 'read history';
const STORAGE_KEY = 'token';

let fetching = false;
let fetchingTo = null;
main();

async function main() {
    const token = checkAndStoreToken();

    let collection = getCollectionFromUrl();

    if (token) {
        loadMultis(token);

        let observer;
        let options = {
            root: null,
            rootMargin: "0px",
            threshold: 0.4,
        };
        observer = new IntersectionObserver((entries, obs) => {
            entries.forEach((entry) => {
                const vid = entry.target.firstChild;
                if (entry.isIntersecting) {
                    vid.play();
                } else {
                    vid.pause();
                }
            });
        }, options);


        let after = '';
        after = await fetchMore(token, observer, collection, after);

        window.document.onscroll = async function(ev) {
            if (fetching) return;

            if(window.scrollY + window.innerHeight + 200 > document.body.scrollHeight) {
                after = await fetchMore(token, observer, collection, after);
            }
        };

        listenForHashChange(async (c) => {
            after = '';
            collection = c
            const root = document.getElementById('root');
            fetching = false;
            clearTimeout(fetchingTo);
            root.innerHTML = '';
            after = await fetchMore(token, observer, collection, after);
        });

    } else {
        const a = document.createElement('a');
        a.setAttribute('href', authenticate());
        a.innerText = "Login";
        const root = document.getElementById('root');
        root.appendChild(a);
    }
}

async function fetchMore(token, observer, col, after = '') {
    if (fetching) return after;
    fetching = true;
    console.log('Fetching more! after = ', after);
    const {after: newAfter, posts} = await fetchPosts(token, after, col);
    const postEls = posts.map(post => {
        const div = document.createElement('div');
        if (post.video) {
            const video = document.createElement('video');
            video.setAttribute('src', post.video);
            video.setAttribute('autoplay', 'true');
            video.setAttribute('loop', 'true');
            video.setAttribute('muted', 'true');
            video.setAttribute('playsinline', 'true');
            div.appendChild(video);
            observer.observe(div);
        } else {
            const img = document.createElement('img');
            img.setAttribute('src', post.url);
            div.appendChild(img);
        }
        const user = document.createElement('span');
        user.innerHTML = `<a href="#/user/${post.author}/submitted">${post.author}</a>`;
        user.classList.add('author');
        div.appendChild(user);

        const subreddit = document.createElement('span');
        subreddit.innerHTML = `<a href="#/r/${post.subreddit}">r/${post.subreddit}</a>`;
        subreddit.classList.add('subreddit');
        div.appendChild(subreddit);

        const created = document.createElement('span');
        created.innerText = toRelativeTime(post.created);
        created.classList.add('created');
        div.appendChild(created);

        const title = document.createElement('span');
        title.innerText = post.title
        title.classList.add('post-title');
        div.appendChild(title);

        fetchingTo = setTimeout(() => {
            fetching = false;
            fetchingTo = null;
        }, 3000);

        return div;
    });
    const root = document.getElementById('root');
    if (!after) {
        await sleep(1000);
    }
    for (const postEl of postEls) {
        root.appendChild(postEl);
    }

    return newAfter;
}

async function loadMultis(token) {
    const multis = await fetchMultis(token);
    const mdiv = document.getElementById('multis');
    multis.forEach(m => {
        const mspan = document.createElement('span');
        mspan.innerHTML = `<a href="#${m.path}">${m.name}</a>`;
        mdiv.appendChild(mspan);
    });
}

function toRelativeTime(date) {
    const secondsAgo = date - ((new Date()).valueOf() / 1000);
    let unit = 'second';
    let ago = secondsAgo;
    if (secondsAgo < -86400) {
        unit = 'day';
        ago = Math.round(secondsAgo / 86400);
    } else if (secondsAgo < -3600) {
        unit = 'hour';
        ago = Math.round(secondsAgo / 3600);
    } else if (secondsAgo < -60) {
        unit = 'minute';
        ago = Math.round(secondsAgo / 60);
    }
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    return rtf.format(ago, unit);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function checkAndStoreToken() {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (params.has('access_token')) {
        const token = params.get('access_token');
        const expires_in = parseInt(params.get('expires_in'));
        const expires = (new Date()).valueOf() + (expires_in * 1000);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expires }));
        window.location.hash = '';
        return token;
    }
    const tokenInfo = window.localStorage.getItem(STORAGE_KEY);
    if (tokenInfo !== null) {
        const token = JSON.parse(tokenInfo);
        if (token.expires > (new Date()).valueOf()) {
            return token.token;
        }
    }

    return null;
}

function authenticate() {
    return `https://www.reddit.com/api/v1/authorize?client_id=${CLIENT_ID}&response_type=token&state=helloworld&redirect_uri=${REDIRECT_URL}&scope=${SCOPES}`;
}

async function fetchMultis(token) {
    let url = `https://oauth.reddit.com/api/multi/mine`;
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    const body = await response.json();
    return body.map(m => ({path: m.data.path, name: m.data.display_name}));
}

async function fetchPosts(token, after, col) {
    let url = `https://oauth.reddit.com${col}`;
    if (after) {
        if (!url.includes("?")) {
            url += `?after=${after}`;
        } else {
            url += `&after=${after}`;
        }
    }
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    const body = await response.json();
    const posts = body.data.children.filter(post => post.data.preview).map(post => {
        if (!post.data.preview) {
            console.log('post has no preview');

        }
        const preview = post.data.preview;
        const video = preview.reddit_video_preview?.fallback_url ?? null;
        return {
            author: post.data.author,
            title: post.data.title,
            created: post.data.created,
            subreddit: post.data.subreddit,
            url: preview.images[0].source.url.replace('&amp;', '&'),
            width: preview.images[0].source.width,
            height: preview.images[0].source.height,
            video: video,
        }
    });

    return { after: body.data.after, posts };
}

function getCollectionFromUrl() {
    const col = window.location.hash.substring(1);
    console.log(col);
    return col;
}

function listenForHashChange(h) {
    window.addEventListener(
      "hashchange",
      () => {
        console.log("The hash has changed!");
        h(getCollectionFromUrl());
      },
      false,
    );
}
