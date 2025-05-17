// YouTube Iframe APIを非同期で読み込む
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

var ytPlayer;
var currentActivePlayer = 'local';

function onYouTubeIframeAPIReady() {
    console.log("YouTube Iframe API is ready.");
}

function onPlayerReady(event) {
    console.log("YouTube Player is ready (onPlayerReady).");
}

var ytPlayerState = -1;
function onPlayerStateChange(event) {
    ytPlayerState = event.data;
    console.log("YouTube Player state changed (original global): ", ytPlayerState);
    // 再生終了時の処理はDOMContentLoaded内のラッパーにあるhandleVideoEndedで行う
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
    const modeSelectionRadios = document.querySelectorAll('input[name="inputMode"]');

    let timestampsData = [];
    let realtimeDisplayTimeoutId = null;
    window.currentlyDisplayedTimestampId = null;
    let currentInputMode = 'koma'; // 初期値はHTMLのcheckedと合わせる

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

    function updateInputButtons() {
        if (!numberButtonsContainer) return;
        numberButtonsContainer.innerHTML = ''; 

        if (currentInputMode === 'yoyo') {
            numberButtonsContainer.classList.add('yoyo-mode');
            numberButtonsContainer.classList.remove('koma-mode');

            // Yo-yo mode: 左に「-1」、右に「+1」
            const minusOneButton = document.createElement('button');
            minusOneButton.className = 'numBtn';
            minusOneButton.dataset.value = '-1';
            minusOneButton.textContent = '-1';
            numberButtonsContainer.appendChild(minusOneButton);

            const plusOneButton = document.createElement('button');
            plusOneButton.className = 'numBtn';
            plusOneButton.dataset.value = '+1';
            plusOneButton.textContent = '+1';
            numberButtonsContainer.appendChild(plusOneButton);

        } else { // koma mode (default)
            numberButtonsContainer.classList.add('koma-mode');
            numberButtonsContainer.classList.remove('yoyo-mode');
            for (let i = 1; i <= 6; i++) {
                const button = document.createElement('button');
                button.className = 'numBtn';
                button.dataset.value = String(i);
                button.textContent = String(i);
                numberButtonsContainer.appendChild(button);
            }
        }
    }

    modeSelectionRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            currentInputMode = this.value;
            updateInputButtons();
            console.log(`入力モードが ${currentInputMode} に変更されました。`);
        });
    });


    function showLocalPlayer() {
        localVideoPlayerElement.style.display = 'block';
        youtubePlayerContainerDiv.style.display = 'none';
        if (ytPlayer && typeof ytPlayer.stopVideo === 'function') {
            ytPlayer.stopVideo();
        }
        currentActivePlayer = 'local';
    }

    function showYouTubePlayer() {
        localVideoPlayerElement.style.display = 'none';
        localVideoPlayerElement.pause();
        youtubePlayerContainerDiv.style.display = 'block';
        currentActivePlayer = 'youtube';
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
                
                clearTimeout(realtimeDisplayTimeoutId);
                if (realtimeDisplayDiv) realtimeDisplayDiv.textContent = '';
                window.currentlyDisplayedTimestampId = null;
                timestampsData = []; 
                if (typeof calculateAndDisplaySum === 'function') calculateAndDisplaySum(); 
                if (typeof renderTimestampsList === 'function') renderTimestampsList();
            } catch (e) {
                console.error('ローカル動画ファイルのURL生成中にエラー:', e);
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
            alert('有効なYouTube動画のURLではないようです。正しいURLを入力してください。\n例: youtube.com/watch?v=');
            return;
        }

        showYouTubePlayer();

        if (ytPlayer && typeof ytPlayer.destroy === 'function') {
            ytPlayer.destroy();
            ytPlayer = null;
        }

        ytPlayer = new YT.Player('youtubePlayerContainer', {
            videoId: videoId,
            playerVars: { 'playsinline': 1 },
            events: {
                'onReady': window.onPlayerReady,
                'onStateChange': window.onPlayerStateChange
            }
        });
        
        clearTimeout(realtimeDisplayTimeoutId);
        if (realtimeDisplayDiv) realtimeDisplayDiv.textContent = '';
        window.currentlyDisplayedTimestampId = null;
        timestampsData = []; 
        if (typeof calculateAndDisplaySum === 'function') calculateAndDisplaySum(); 
        if (typeof renderTimestampsList === 'function') renderTimestampsList();
    });

    function extractYouTubeVideoId(url) {
        let videoId = null;
        const regexStandard = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regexStandard);
        if (match && match[1]) {
            videoId = match[1];
        } else {
            try {
                const urlObj = new URL(url);
                if ((urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com') && urlObj.searchParams.has('v')) {
                     videoId = urlObj.searchParams.get('v');
                } else if (urlObj.hostname === 'youtu.be' && urlObj.pathname.length > 1) {
                     videoId = urlObj.pathname.substring(1);
                }
            } catch (e) {
                console.warn("URL parsing failed for special googleusercontent.com format:", e);
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
            const state = ytPlayer.getPlayerState();
            if (state === YT.PlayerState.UNSTARTED || state === -1 || ytPlayer.getDuration() === 0 ) {
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
            if (event.target.classList.contains('numBtn') && event.target.dataset.value) {
                addTimestamp(event.target.dataset.value);
            }
        });
    }

    document.addEventListener('keydown', function(event) {
        const targetTagName = event.target.tagName.toLowerCase();
        if (targetTagName === 'input' || targetTagName === 'textarea') {
            return;
        }

        if (currentInputMode === 'koma') {
            const numpadKeys = {'Numpad1':'1','Numpad2':'2','Numpad3':'3','Numpad4':'4','Numpad5':'5','Numpad6':'6'};
            const numpadNumber = numpadKeys[event.code];
            if (numpadNumber) {
                addTimestamp(numpadNumber);
                event.preventDefault();
                return;
            }
        }
        
        if (event.key === 'p' || event.key === 'P') {
            addTimestamp(currentInputMode === 'yoyo' ? "+1" : "1");
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
    
    const originalGlobalOnPlayerStateChange = window.onPlayerStateChange;
    window.onPlayerStateChange = function(event) {
        if (typeof originalGlobalOnPlayerStateChange === 'function' && originalGlobalOnPlayerStateChange !== window.onPlayerStateChange) {
            originalGlobalOnPlayerStateChange(event);
        }
        ytPlayerState = event.data;
        console.log("YouTube Player state changed (DOMContentLoaded wrapper): ", ytPlayerState);

        if (ytPlayerState === YT.PlayerState.PLAYING) {
            startYouTubeTimeUpdate();
        } else if (ytPlayerState === YT.PlayerState.PAUSED || ytPlayerState === YT.PlayerState.ENDED || ytPlayerState === YT.PlayerState.CUED) {
            stopYouTubeTimeUpdate();
        }
        if (ytPlayerState === YT.PlayerState.ENDED) {
            handleVideoEnded();
        }
    };

    function handleTimeUpdate() {
        let currentTime;
        let duration;
        let isSeeking = false;

        if (currentActivePlayer === 'local') {
            if (!localVideoPlayerElement.src || isNaN(localVideoPlayerElement.duration)) return;
            currentTime = localVideoPlayerElement.currentTime;
            duration = localVideoPlayerElement.duration;
            isSeeking = localVideoPlayerElement.seeking;
        } else if (currentActivePlayer === 'youtube' && ytPlayer && typeof ytPlayer.getCurrentTime === 'function' && typeof ytPlayer.getDuration === 'function') {
            if (ytPlayer.getPlayerState() === YT.PlayerState.UNSTARTED || isNaN(ytPlayer.getDuration()) || ytPlayer.getDuration() === 0) return;
            currentTime = ytPlayer.getCurrentTime();
            duration = ytPlayer.getDuration();
        } else {
            return;
        }

        if (timestampsData.length === 0 || isNaN(duration) || isSeeking) {
            return;
        }

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
            if (window.currentlyDisplayedTimestampId !== activeEntry.id) {
                clearTimeout(realtimeDisplayTimeoutId);
                let displayText = `記録内容: ${activeEntry.number}`;
                if (activeEntry.reason && activeEntry.reason.trim() !== '') {
                    displayText += ` - 理由: ${activeEntry.reason}`;
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
        if (currentActivePlayer === 'youtube') {
            stopYouTubeTimeUpdate();
        }
    }

    if (localVideoPlayerElement) {
        localVideoPlayerElement.addEventListener('timeupdate', handleTimeUpdate);
        localVideoPlayerElement.addEventListener('ended', handleVideoEnded);
    }
    
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

    updateInputButtons();
    renderTimestampsList();
    calculateAndDisplaySum();
    console.log('初期化完了、新レイアウトおよびYo-yo modeボタン配置対応済み。');
});