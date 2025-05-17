// YouTube Iframe APIを非同期で読み込む
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api"; // 標準のAPI URLを使用
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

var ytPlayer; // YouTubeプレーヤーのインスタンスを保持するグローバル変数
var currentActivePlayer = 'local'; // 'local' または 'youtube'

// APIの準備ができたら呼ばれる関数 (グローバルに定義する必要あり)
function onYouTubeIframeAPIReady() {
    console.log("YouTube Iframe API is ready.");
    // この時点ではプレーヤーはまだ作成しない。ボタンクリック時に作成する。
}

// プレーヤーの準備ができたら呼ばれるコールバック (YT.Playerのイベント)
function onPlayerReady(event) {
    console.log("YouTube Player is ready (onPlayerReady).");
    // event.target.playVideo(); // 必要なら自動再生
}

// プレーヤーの状態が変わったら呼ばれるコールバック (YT.Playerのイベント)
var ytPlayerState = -1; // YT.PlayerState.UNSTARTED
function onPlayerStateChange(event) {
    ytPlayerState = event.data;
    console.log("YouTube Player state changed: ", ytPlayerState);
    // ここで再生終了(YT.PlayerState.ENDED)などを検知して、
    // 既存のリアルタイム表示クリアなどの処理を呼び出す必要がある
    if (ytPlayerState === YT.PlayerState.ENDED) {
        if (realtimeDisplayDiv) realtimeDisplayDiv.textContent = '';
        if (typeof currentlyDisplayedTimestampId !== 'undefined') currentlyDisplayedTimestampId = null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const videoUpload = document.getElementById('videoUpload');
    const localVideoPlayerElement = document.getElementById('videoPlayer');
    const youtubeUrlInput = document.getElementById('youtubeUrlInput');
    const loadYouTubeVideoBtn = document.getElementById('loadYouTubeVideoBtn');
    const youtubePlayerContainerDiv = document.getElementById('youtubePlayerContainer');

    const numberButtonsContainer = document.getElementById('numberButtons');
    const timestampsListDiv = document.getElementById('timestampsList');
    const resetTimestampsBtn = document.getElementById('resetTimestampsBtn');
    const realtimeDisplayDiv = document.getElementById('realtimeDisplay');
    const sumDisplayDiv = document.getElementById('sumDisplay');

    let timestampsData = [];
    let realtimeDisplayTimeoutId = null;
    // `currentlyDisplayedTimestampId` はグローバルスコープの onPlayerStateChange からも参照されるため window オブジェクト経由でアクセス
    window.currentlyDisplayedTimestampId = null;

    function formatTime(totalSeconds) {
        const flooredSeconds = Math.floor(totalSeconds);
        const minutes = Math.floor(flooredSeconds / 60);
        const seconds = flooredSeconds % 60;
        if (isNaN(minutes) || isNaN(seconds)) return '00:00';
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    function parseTime(timeString) {
       if (!timeString || !timeString.includes(':')) return 0;
        const parts = timeString.split(':');
        const minutes = parseInt(parts[0], 10); const seconds = parseInt(parts[1], 10);
        if (isNaN(minutes) || isNaN(seconds)) return 0;
        return minutes * 60 + seconds;
    }

    function showLocalPlayer() {
        localVideoPlayerElement.style.display = 'block';
        youtubePlayerContainerDiv.style.display = 'none';
        if (ytPlayer && typeof ytPlayer.stopVideo === 'function') {
            ytPlayer.stopVideo();
        }
        currentActivePlayer = 'local';
        console.log('Switched to Local Player');
    }

    function showYouTubePlayer() {
        localVideoPlayerElement.style.display = 'none';
        localVideoPlayerElement.pause();
        youtubePlayerContainerDiv.style.display = 'block';
        currentActivePlayer = 'youtube';
        console.log('Switched to YouTube Player');
    }
    
    videoUpload.addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (file) {
            showLocalPlayer();
            try {
                if (localVideoPlayerElement.src && localVideoPlayerElement.src.startsWith('blob:')) {
                    URL.revokeObjectURL(localVideoPlayerElement.src);
                }
                const fileURL = URL.createObjectURL(file);
                localVideoPlayerElement.src = fileURL;
                console.log('ローカル動画ファイルが選択されました:', file.name);
                
                clearTimeout(realtimeDisplayTimeoutId);
                if (realtimeDisplayDiv) realtimeDisplayDiv.textContent = '';
                window.currentlyDisplayedTimestampId = null;
                timestampsData = []; 
                if (typeof calculateAndDisplaySum === 'function') calculateAndDisplaySum(); 
                if (typeof renderTimestampsList === 'function') renderTimestampsList();
            } catch (e) {
                console.error('ローカル動画ファイルのURL生成中にエラーが発生しました:', e);
                alert('ローカル動画ファイルの読み込み中にエラーが発生しました。');
            }
        }
    });

    loadYouTubeVideoBtn.addEventListener('click', function() {
        const url = youtubeUrlInput.value.trim();
        if (!url) {
            alert('YouTubeのURLを入力してください。');
            return;
        }
        const videoId = extractYouTubeVideoId(url);
        if (!videoId) {
            alert('有効なYouTube動画のURLではないようです。正しいURLを入力してください。\n例: https://www.youtube.com/watch?v=XXXXXXXXXXX'); // このURL例は標準的なものに変更を推奨
            return;
        }

        showYouTubePlayer();

        if (ytPlayer && typeof ytPlayer.destroy === 'function') {
            ytPlayer.destroy();
        }

        // YouTube Playerのサイズ指定を削除し、CSSで制御するようにする
        ytPlayer = new YT.Player('youtubePlayerContainer', {
            // height と width の指定を削除
            videoId: videoId,
            playerVars: {
                'playsinline': 1
            },
            events: {
                'onReady': window.onPlayerReady, // グローバル関数を明示的に指定
                'onStateChange': window.onPlayerStateChange // グローバル関数を明示的に指定
            }
        });
        
        clearTimeout(realtimeDisplayTimeoutId);
        if (realtimeDisplayDiv) realtimeDisplayDiv.textContent = '';
        window.currentlyDisplayedTimestampId = null;
        timestampsData = []; 
        if (typeof calculateAndDisplaySum === 'function') calculateAndDisplaySum(); 
        if (typeof renderTimestampsList === 'function') renderTimestampsList();
        console.log(`YouTube video ID ${videoId} の読み込みを試みます。`);
    });

    function extractYouTubeVideoId(url) {
        let videoId = null;
        try {
            const urlObj = new URL(url);
            // 注意: 'googleusercontent.com' を含むURLの判定は、標準的なYouTube URLとは異なる特殊なケースです。
            // 一般的なYouTube URL (youtube.com, youtu.be) の対応を優先すべきです。
            if (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com') {
                videoId = urlObj.searchParams.get('v');
            } else if (urlObj.hostname === 'youtu.be') {
                videoId = urlObj.pathname.substring(1);
            }
        } catch (e) {
            // new URL() で失敗した場合や、上記条件に合致しない場合、正規表現で試みる
            console.warn("URL parsing failed for initial check, trying regex:", e);
        }

        if (!videoId) { // 上記で videoId が取得できなかった場合にのみ正規表現を実行
            const regexStandard = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
            const match = url.match(regexStandard);
            if (match && match[1]) {
                videoId = match[1];
            }
        }
        return videoId;
    }

    function calculateAndDisplaySum() {
        let sum = 0;
        for (const entry of timestampsData) {
            const num = parseInt(entry.number, 10);
            if (!isNaN(num)) { sum += num; }
        }
        if (sumDisplayDiv) sumDisplayDiv.textContent = `合計: ${sum}`;
    }

    function addTimestamp(selectedNumberString) {
        let currentTime;
        if (currentActivePlayer === 'local') {
            if (!localVideoPlayerElement.src || localVideoPlayerElement.duration === undefined || isNaN(localVideoPlayerElement.duration)) {
                alert('まず動画を選択し、再生可能な状態にしてください。'); return;
            }
            currentTime = localVideoPlayerElement.currentTime;
        } else if (currentActivePlayer === 'youtube' && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
            if (ytPlayer.getPlayerState() === YT.PlayerState.UNSTARTED || ytPlayer.getDuration() === 0 ) {
                 alert('YouTube動画が再生可能な状態ではありません。'); return;
            }
            currentTime = ytPlayer.getCurrentTime();
        } else {
            alert('動画が読み込まれていないか、再生準備ができていません。'); return;
        }

        const newTimestamp = {
            id: Date.now(),
            time: formatTime(currentTime),
            number: selectedNumberString,
            reason: ''
        };
        timestampsData.push(newTimestamp);
        timestampsData.sort((a, b) => parseTime(a.time) - parseTime(b.time));
        renderTimestampsList();
        calculateAndDisplaySum();
    }

    if (numberButtonsContainer) {
        numberButtonsContainer.addEventListener('click', function(event) {
            if (event.target.classList.contains('numBtn')) {
                addTimestamp(event.target.dataset.value);
            }
        });
    }

    document.addEventListener('keydown', function(event) {
        const targetTagName = event.target.tagName.toLowerCase();
        if (targetTagName === 'input' || targetTagName === 'textarea') {
            return; // 入力フィールドにフォーカスがある場合は何もしない
        }
        const numpadKeys = {'Numpad1':'1','Numpad2':'2','Numpad3':'3','Numpad4':'4','Numpad5':'5','Numpad6':'6'};
        const numpadNumber = numpadKeys[event.code];
        if (numpadNumber) {
            addTimestamp(numpadNumber);
            event.preventDefault(); // デフォルト動作（あれば）を抑制
            return; 
        }
        if (event.key === 'p' || event.key === 'P') {
            addTimestamp("1");
            event.preventDefault();
        } else if (event.key === 'o' || event.key === 'O') {
            addTimestamp("-1");
            event.preventDefault();
        }
    });

    if (resetTimestampsBtn) {
        resetTimestampsBtn.addEventListener('click', function() {
            if (timestampsData.length === 0) {
                alert('リセットするタイムスタンプがありません。'); return;
            }
            if (confirm('記録されている全てのタイムスタンプと理由をリセットしますか？この操作は元に戻せません。')) {
                timestampsData = [];
                renderTimestampsList();
                clearTimeout(realtimeDisplayTimeoutId);
                if (realtimeDisplayDiv) realtimeDisplayDiv.textContent = '';
                window.currentlyDisplayedTimestampId = null;
                calculateAndDisplaySum();
                alert('タイムスタンプがリセットされました。');
            }
        });
    }

    let youtubeTimeUpdateInterval = null;
    function startYouTubeTimeUpdate() {
        if (youtubeTimeUpdateInterval) clearInterval(youtubeTimeUpdateInterval);
        youtubeTimeUpdateInterval = setInterval(() => {
            if (ytPlayer && typeof ytPlayer.getPlayerState === 'function' && ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) {
                handleTimeUpdate();
            }
        }, 250);
    }
    function stopYouTubeTimeUpdate() {
        clearInterval(youtubeTimeUpdateInterval);
    }
    
    // onPlayerStateChange はグローバルなので、DOMContentLoaded外の定義を参照・拡張する
    // または、最初からDOMContentLoaded内で全てのロジックを定義し、windowに割り当てる
    // ここでは、グローバル関数を拡張する形でwindow.onPlayerStateChangeを上書き定義
    const originalOnPlayerStateChange = window.onPlayerStateChange; // 元の関数を保持
    window.onPlayerStateChange = function(event) {
        if (typeof originalOnPlayerStateChange === 'function') {
            originalOnPlayerStateChange(event); // 元の処理を呼び出す
        }
        // 追加の処理
        ytPlayerState = event.data; // ytPlayerStateを更新
        console.log("YouTube Player state changed (DOMContentLoaded wrapper): ", ytPlayerState);
        if (ytPlayerState === YT.PlayerState.PLAYING) {
            startYouTubeTimeUpdate();
        } else if (ytPlayerState === YT.PlayerState.PAUSED || ytPlayerState === YT.PlayerState.ENDED || ytPlayerState === YT.PlayerState.CUED) {
            stopYouTubeTimeUpdate();