// YouTube Iframe APIを非同期で読み込む
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
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
        if (typeof currentlyDisplayedTimestampId !== 'undefined') currentlyDisplayedTimestampId = null; // グローバルにアクセスできるように
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const videoUpload = document.getElementById('videoUpload');
    const localVideoPlayerElement = document.getElementById('videoPlayer'); // HTML5 <video> 要素
    const youtubeUrlInput = document.getElementById('youtubeUrlInput');
    const loadYouTubeVideoBtn = document.getElementById('loadYouTubeVideoBtn');
    const youtubePlayerContainerDiv = document.getElementById('youtubePlayerContainer');

    // 既存のUI要素への参照 (後で使うために保持)
    const numberButtonsContainer = document.getElementById('numberButtons');
    const timestampsListDiv = document.getElementById('timestampsList');
    const resetTimestampsBtn = document.getElementById('resetTimestampsBtn');
    const realtimeDisplayDiv = document.getElementById('realtimeDisplay');
    const sumDisplayDiv = document.getElementById('sumDisplay');

    let timestampsData = []; // タイムスタンプデータ (これは共通で使う)
    let realtimeDisplayTimeoutId = null;
    let currentlyDisplayedTimestampId = null; // これはグローバルスコープのonPlayerStateChangeからも参照したい

    // ユーティリティ関数 (parseTime, formatTime は後で使うので残す)
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

    // --- UI表示切り替え ---
    function showLocalPlayer() {
        localVideoPlayerElement.style.display = 'block';
        youtubePlayerContainerDiv.style.display = 'none';
        if (ytPlayer && typeof ytPlayer.stopVideo === 'function') { // 既存のYTプレーヤーがあれば停止
            ytPlayer.stopVideo();
        }
        currentActivePlayer = 'local';
        console.log('Switched to Local Player');
    }

    function showYouTubePlayer() {
        localVideoPlayerElement.style.display = 'none';
        localVideoPlayerElement.pause(); // ローカルビデオを停止
        if (localVideoPlayerElement.src) { // ローカルビデオのソースもクリアした方が良い場合がある
             // URL.revokeObjectURL(localVideoPlayerElement.src); // これはcreateObjectURLした場合のみ
             // localVideoPlayerElement.src = '';
        }
        youtubePlayerContainerDiv.style.display = 'block';
        currentActivePlayer = 'youtube';
        console.log('Switched to YouTube Player');
    }
    
    // --- ローカル動画ファイルの読み込み処理 (既存のものをベースに調整) ---
    videoUpload.addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (file) {
            showLocalPlayer(); // ローカルプレーヤーを表示
            try {
                if (localVideoPlayerElement.src && localVideoPlayerElement.src.startsWith('blob:')) {
                    URL.revokeObjectURL(localVideoPlayerElement.src);
                }
                const fileURL = URL.createObjectURL(file);
                localVideoPlayerElement.src = fileURL;
                console.log('ローカル動画ファイルが選択されました:', file.name);
                
                // 関連データのクリア
                clearTimeout(realtimeDisplayTimeoutId);
                if (realtimeDisplayDiv) realtimeDisplayDiv.textContent = '';
                currentlyDisplayedTimestampId = null;
                timestampsData = []; 
                if (typeof calculateAndDisplaySum === 'function') calculateAndDisplaySum(); 
                if (typeof renderTimestampsList === 'function') renderTimestampsList();
            } catch (e) {
                console.error('ローカル動画ファイルのURL生成中にエラーが発生しました:', e);
                alert('ローカル動画ファイルの読み込み中にエラーが発生しました。');
            }
        }
    });

    // --- YouTube動画読み込み処理 ---
    loadYouTubeVideoBtn.addEventListener('click', function() {
        const url = youtubeUrlInput.value.trim();
        if (!url) {
            alert('YouTubeのURLを入力してください。');
            return;
        }
        const videoId = extractYouTubeVideoId(url);
        if (!videoId) {
            alert('有効なYouTube動画のURLではないようです。正しいURLを入力してください。\n例: https://www.youtube.com/watch?v=XXXXXXXXXXX');
            return;
        }

        showYouTubePlayer(); // YouTubeプレーヤーエリアを表示

        // 既存のytPlayerインスタンスがあれば破棄
        if (ytPlayer && typeof ytPlayer.destroy === 'function') {
            ytPlayer.destroy();
        }

        // 新しいプレーヤーを作成
        ytPlayer = new YT.Player('youtubePlayerContainer', {
            height: '360', // CSSで指定した高さと合わせるか、ここで指定
            width: '600',  // CSSで指定した幅と合わせるか、ここで指定
            videoId: videoId,
            playerVars: {
                'playsinline': 1 // iOSでインライン再生するため
            },
            events: {
                'onReady': onPlayerReady,       // グローバル関数を指定
                'onStateChange': onPlayerStateChange // グローバル関数を指定
            }
        });
        
        // 関連データのクリア
        clearTimeout(realtimeDisplayTimeoutId);
        if (realtimeDisplayDiv) realtimeDisplayDiv.textContent = '';
        currentlyDisplayedTimestampId = null;
        timestampsData = []; 
        if (typeof calculateAndDisplaySum === 'function') calculateAndDisplaySum(); 
        if (typeof renderTimestampsList === 'function') renderTimestampsList();
        console.log(`YouTube video ID ${videoId} の読み込みを試みます。`);
    });

    function extractYouTubeVideoId(url) {
        let videoId = null;
        try {
            const urlObj = new URL(url);
            if (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com') {
                videoId = urlObj.searchParams.get('v');
            } else if (urlObj.hostname === 'youtu.be') {
                videoId = urlObj.pathname.substring(1);
            }
        } catch (e) {
            console.error("Invalid URL for YouTube ID extraction:", e);
            // 短縮URLや特殊な形式に対応するため、より堅牢な正規表現を使うことも検討
            const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/gi;
            const match = regex.exec(url);
            if (match && match[1]) {
                videoId = match[1];
            }
        }
        return videoId;
    }


    // ▼▼▼ 既存のタイムスタンプ関連の関数群 (ひとまずコメントアウトまたは後で調整) ▼▼▼
    // これらの関数は、currentActivePlayerに応じて localVideoPlayerElement または ytPlayer を
    // 参照するように修正が必要になります。
    
    // 合計値を計算して表示 (これは timestampsData を見るので、そのままでも機能するはず)
    function calculateAndDisplaySum() {
        let sum = 0;
        for (const entry of timestampsData) {
            const num = parseInt(entry.number, 10);
            if (!isNaN(num)) { sum += num; }
        }
        if (sumDisplayDiv) sumDisplayDiv.textContent = `合計: ${sum}`;
        console.log('合計値を更新しました:', sum);
    }

    // タイムスタンプ追加処理 (要調整)
    function addTimestamp(selectedNumberString) {
        let currentTime;
        if (currentActivePlayer === 'local') {
            if (!localVideoPlayerElement.src || localVideoPlayerElement.duration === undefined || isNaN(localVideoPlayerElement.duration)) {
                alert('まず動画を選択し、再生可能な状態にしてください。'); return;
            }
            currentTime = localVideoPlayerElement.currentTime;
        } else if (currentActivePlayer === 'youtube' && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
            // YouTubeプレーヤーが準備完了していて、再生時間が取得できるか確認
            if (ytPlayer.getPlayerState() === YT.PlayerState.UNSTARTED || ytPlayer.getPlayerState() === -1 /* YT.PlayerState.UNSTARTED と同義 */ || ytPlayer.getDuration() === 0 ) {
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
        console.log(`タイムスタンプ追加 (記録された数字: ${selectedNumberString}):`, newTimestamp);
        renderTimestampsList();
        calculateAndDisplaySum();
    }

    // 数字ボタンクリック (addTimestampを呼ぶので、addTimestampが対応すればOK)
    if (numberButtonsContainer) {
        numberButtonsContainer.addEventListener('click', function(event) {
            if (event.target.classList.contains('numBtn')) {
                addTimestamp(event.target.dataset.value);
            }
        });
    }

    // キーボード入力処理 (addTimestampを呼ぶので、addTimestampが対応すればOK)
    document.addEventListener('keydown', function(event) {
        const targetTagName = event.target.tagName.toLowerCase();
        if (targetTagName === 'input' || targetTagName === 'textarea') {
            return;
        }
        const numpadKeys = {'Numpad1':'1','Numpad2':'2','Numpad3':'3','Numpad4':'4','Numpad5':'5','Numpad6':'6'};
        const numpadNumber = numpadKeys[event.code];
        if (numpadNumber) {
            addTimestamp(numpadNumber);
            return; 
        }
        if (event.key === 'p' || event.key === 'P') {
            addTimestamp("1");
        } else if (event.key === 'o' || event.key === 'O') {
            addTimestamp("-1");
        }
    });

    // タイムスタンプリセット処理 (これは timestampsData を操作するので、そのままでOK)
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
                currentlyDisplayedTimestampId = null;
                calculateAndDisplaySum();
                console.log('全てのタイムスタンプがリセットされました。');
                alert('タイムスタンプがリセットされました。');
            }
        });
    }

    // リアルタイム表示ロジック (要調整: getCurrentTime と再生状態の取得方法)
    // グローバルスコープの `currentlyDisplayedTimestampId` を使うように変更
    window.currentlyDisplayedTimestampId = null; // グローバルアクセス用

    if (localVideoPlayerElement) {
        localVideoPlayerElement.addEventListener('timeupdate', handleTimeUpdate);
        localVideoPlayerElement.addEventListener('ended', handleVideoEnded);
        localVideoPlayerElement.addEventListener('pause', handleVideoPause); // 必要なら
        localVideoPlayerElement.addEventListener('play', handleVideoPlay);   // 必要なら
    }
    
    // YouTube Player APIは直接timeupdateイベントを発生させないため、ポーリングが必要
    let youtubeTimeUpdateInterval = null;
    function startYouTubeTimeUpdate() {
        if (youtubeTimeUpdateInterval) clearInterval(youtubeTimeUpdateInterval);
        youtubeTimeUpdateInterval = setInterval(() => {
            if (ytPlayer && typeof ytPlayer.getPlayerState === 'function' && ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) {
                handleTimeUpdate(); // 共通のタイムアップデート処理を呼ぶ
            }
        }, 250); // 250msごと (YouTubeの推奨はこれくらい)
    }
    function stopYouTubeTimeUpdate() {
        clearInterval(youtubeTimeUpdateInterval);
    }
    
    // onPlayerStateChange でポーリングを開始/停止
    // onPlayerStateChange はグローバル関数なので、そこで start/stop を呼ぶ
    // (既にある onPlayerStateChange に追記する形)
    // 例: if (event.data === YT.PlayerState.PLAYING) { startYouTubeTimeUpdate(); }
    //     else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) { stopYouTubeTimeUpdate(); }
    // onPlayerReady でも、もし自動再生するなら startYouTubeTimeUpdate() を呼ぶ。


    function handleTimeUpdate() {
        let currentTime;
        let duration;
        let isPlaying;

        if (currentActivePlayer === 'local') {
            currentTime = localVideoPlayerElement.currentTime;
            duration = localVideoPlayerElement.duration;
            isPlaying = !localVideoPlayerElement.paused;
        } else if (currentActivePlayer === 'youtube' && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
            currentTime = ytPlayer.getCurrentTime();
            duration = ytPlayer.getDuration();
            isPlaying = (ytPlayer.getPlayerState() === YT.PlayerState.PLAYING);
        } else {
            return; // プレーヤーが準備できていない
        }

        if (timestampsData.length === 0 || isNaN(duration) || videoPlayer.seeking) { // videoPlayer.seekingはローカルのみ
            return;
        }

        // 共通のリアルタイム表示ロジック
        let activeEntry = null;
        for (const entry of timestampsData) {
            const timestampTimeInSeconds = parseTime(entry.time);
            if (currentTime >= timestampTimeInSeconds && currentTime < timestampTimeInSeconds + 1.0) {
                activeEntry = entry;
                break; 
            }
            if (currentTime < timestampTimeInSeconds) {
                break;
            }
        }
        if (activeEntry) {
            if (window.currentlyDisplayedTimestampId !== activeEntry.id) { // グローバル変数を使用
                clearTimeout(realtimeDisplayTimeoutId);
                let displayText = `記録内容: ${activeEntry.number}`;
                if (activeEntry.reason && activeEntry.reason.trim() !== '') {
                    displayText += ` - 理由: ${activeEntry.reason}`;
                } else if (activeEntry.number === "1" || activeEntry.number === "-1") {
                    // p/oキーで理由がない場合は特に「理由なし」と表示しなくても良いかもしれない
                } else {
                    // displayText += ` - (理由はありません)`; // 表示しない方がスッキリするかも
                }
                if (realtimeDisplayDiv) realtimeDisplayDiv.textContent = displayText;
                window.currentlyDisplayedTimestampId = activeEntry.id;
                realtimeDisplayTimeoutId = setTimeout(() => {
                    if (window.currentlyDisplayedTimestampId === activeEntry.id) {
                        if (realtimeDisplayDiv) realtimeDisplayDiv.textContent = '';
                        window.currentlyDisplayedTimestampId = null;
                    }
                }, 700);
            }
        }
    }

    function handleVideoEnded() {
        clearTimeout(realtimeDisplayTimeoutId);
        if (realtimeDisplayDiv) realtimeDisplayDiv.textContent = '';
        window.currentlyDisplayedTimestampId = null;
    }
    function handleVideoPause() { /* 必要に応じて */ }
    function handleVideoPlay() { /* 必要に応じて */ }

    // タイムスタンプリストの描画 (変更なし)
    function renderTimestampsList() {
        if (!timestampsListDiv) return;
        timestampsListDiv.innerHTML = '';
        if (timestampsData.length === 0) {
            timestampsListDiv.innerHTML = '<p>ここに記録されたタイムスタンプが表示されます。</p>';
            return;
        }
        const ul = document.createElement('ul');
        ul.style.listStyleType = 'none'; ul.style.padding = '0';
        timestampsData.forEach(entry => {
            const li = document.createElement('li');
            li.className = 'timestamp-entry'; li.dataset.id = entry.id;
            const timeDisplay = document.createElement('span');
            timeDisplay.textContent = `時間: ${entry.time} - 記録された数字: ${entry.number}`;
            const reasonInput = document.createElement('input');
            reasonInput.type = 'text'; reasonInput.className = 'reason-input';
            reasonInput.placeholder = '理由を入力...'; reasonInput.value = entry.reason;
            reasonInput.dataset.inputId = entry.id;
            const saveButton = document.createElement('button');
            saveButton.className = 'save-reason-btn'; saveButton.textContent = '理由を保存';
            saveButton.dataset.buttonId = entry.id;
            const savedStatus = document.createElement('span');
            savedStatus.className = 'reason-saved'; savedStatus.dataset.statusId = entry.id;
            li.appendChild(timeDisplay); li.appendChild(reasonInput);
            li.appendChild(saveButton); li.appendChild(savedStatus);
            ul.appendChild(li);
        });
        timestampsListDiv.appendChild(ul);
    }

    // 理由の保存 (変更なし)
    if (timestampsListDiv) {
        timestampsListDiv.addEventListener('click', function(event) {
            if (event.target.classList.contains('save-reason-btn')) {
                const entryId = Number(event.target.dataset.buttonId);
                const reasonInput = timestampsListDiv.querySelector(`.reason-input[data-input-id='${entryId}']`);
                if (!reasonInput) return;
                const reason = reasonInput.value.trim();
                const dataEntry = timestampsData.find(d => d.id === entryId);
                if (dataEntry) {
                    dataEntry.reason = reason;
                    const savedStatus = timestampsListDiv.querySelector(`.reason-saved[data-status-id='${entryId}']`);
                    if (savedStatus) {
                        savedStatus.textContent = '理由を保存しました！';
                        setTimeout(() => { savedStatus.textContent = ''; }, 3000);
                    }
                }
            }
        });
    }

    // 初期表示
    renderTimestampsList();
    calculateAndDisplaySum();
    console.log('初期化完了、YouTube対応準備中...');

    // ★ グローバルスコープに関数を公開する必要があるもの ★
    // onPlayerReady, onPlayerStateChange はYT APIから呼ばれるためグローバルに必要
    // handleTimeUpdate の中で使う currentlyDisplayedTimestampId も整合性を保つため
    // グローバルにするか、イベント経由で渡すなど工夫が必要。
    // 今回は onPlayerStateChange と onPlayerReady を既にグローバルに定義済みなので、
    // currentlyDisplayedTimestampId も window オブジェクト経由でアクセスするように変更。
    // また、startYouTubeTimeUpdate と stopYouTubeTimeUpdate もグローバル関数 onPlayerStateChange から呼ばれる必要がある。
    window.onPlayerReady = onPlayerReady;
    window.onPlayerStateChange = function(event) { // 元のonPlayerStateChangeをラップして追加処理
        ytPlayerState = event.data;
        console.log("YouTube Player state changed (DOMContentLoaded): ", ytPlayerState);
        if (ytPlayerState === YT.PlayerState.PLAYING) {
            startYouTubeTimeUpdate();
        } else if (ytPlayerState === YT.PlayerState.PAUSED || ytPlayerState === YT.PlayerState.ENDED) {
            stopYouTubeTimeUpdate();
        }
        if (ytPlayerState === YT.PlayerState.ENDED) {
            handleVideoEnded(); // 共通の終了処理
        }
    };
});