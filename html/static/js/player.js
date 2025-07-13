
import {q, qa, ElemJS} from "/static/js/elemjs/elemjs.js"
import {SubscribeButton} from "/static/js/modules/SubscribeButton.js"

const video = q("#video")
const audio = q("#audio")

const videoFormats = new Map()
const audioFormats = new Map()
for (const f of [].concat(
        data.formatStreams.map(f => (f.isAdaptive = false, f)),
        data.adaptiveFormats.map(f => (f.isAdaptive = true, f))
)) {
        if (f.type.startsWith("video")) {
                videoFormats.set(f.itag, f)
        } else {
                audioFormats.set(f.itag, f)
        }
}

function getBestAudioFormat() {
        let best = null
        let aidub = false
        for (const f of audioFormats.values()) {
                if (f.resolution.includes("default")) {
                        aidub = true
                }
        }
        for (const f of audioFormats.values()) {
                if (!aidub || f.resolution.includes("default")) {
                        if (best === null || f.bitrate > best.bitrate) {
                                best = f
                        }
                }
        }
        return best
}

class FormatLoader {
        constructor() {
                this.npv = videoFormats.get(q("#video").getAttribute("data-itag"))
                this.npa = null
        }

        play(itag) {
                this.npv = videoFormats.get(itag)
                if (this.npv.isAdaptive) {
                        this.npa = getBestAudioFormat()
                } else {
                        this.npa = null
                }
                this.update()
        }

        update() {
            const lastTime = video.currentTime;
            const proxyBase = "/proxy?url=";

            // 更新视频源
            if (this.npv && this.npv.url) {
                const videoUrl = encodeURIComponent(this.npv.url);
                const proxiedVideoUrl = proxyBase + videoUrl;
                // 检查代理响应
                fetch(proxiedVideoUrl, {
                    method: "HEAD",
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                        "Referer": "https://www.youtube.com/"
                    }
                })
                    .then(response => {
                        if (!response.ok) {
                            return response.text().then(text => {
                                throw new Error(`视频加载失败 (HTTP ${response.status}): ${text}`);
                            });
                        }
                        // 设置视频源
                        video.src = proxiedVideoUrl;
                        video.currentTime = lastTime;
                    })
                    .catch(error => {
                        console.error("视频加载错误:", error);
                        video.pause();
                        video.removeAttribute("src");
                    });
            } else {
                video.pause();
                video.removeAttribute("src");
            }

            // 更新音频源
            if (this.npa && this.npa.url) {
                const audioUrl = encodeURIComponent(this.npa.url);
                const proxiedAudioUrl = proxyBase + audioUrl;
                // 检查代理响应
                fetch(proxiedAudioUrl, {
                    method: "HEAD",
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                        "Referer": "https://www.youtube.com/"
                    }
                })
                    .then(response => {
                        if (!response.ok) {
                            return response.text().then(text => {
                                throw new Error(`音频加载失败 (HTTP ${response.status}): ${text}`);
                            });
                        }
                        // 设置音频源
                        audio.src = proxiedAudioUrl;
                        audio.currentTime = lastTime;
                    })
                    .catch(error => {
                        console.error("音频加载错误:", error);
                        audio.pause();
                        audio.removeAttribute("src");
                    });
            } else {
                audio.pause();
                audio.removeAttribute("src");
            }
        }
}

const formatLoader = new FormatLoader()

class PlayManager {
        constructor(media, isAudio) {
                this.media = media
                this.isAudio = isAudio
        }

        isActive() {
                return !this.isAudio || formatLoader.npa
        }

        play() {
                if (this.isActive()) this.media.play()
        }

        pause() {
                if (this.isAudio) this.media.pause()
        }
}

const playManagers = {
        video: new PlayManager(video, false),
        audio: new PlayManager(audio, true)
}

class QualitySelect extends ElemJS {
        constructor() {
                super(q("#quality-select"))
                this.on("input", this.setFormat.bind(this))
                this.setFormat()
        }

        setFormat() {
                const itag = this.element.value
                formatLoader.play(itag)
                video.focus()
        }
}

const qualitySelect = new QualitySelect()

const ignoreNext = {
        play: 0
}

function playbackIntervention(event) {
        console.log(event.target.tagName.toLowerCase(), event.type)
        if (audio.src) {
                let target = event.target
                let other = (event.target === video ? audio : video)
                let targetPlayManager = playManagers[target.tagName.toLowerCase()]
                let otherPlayManager = playManagers[other.tagName.toLowerCase()]
                if (ignoreNext[event.type] > 0) {
                        ignoreNext[event.type]--
                        return
                }
                switch (event.type) {
                case "durationchange":
                        target.ready = false;
                        break;
                case "seeked":
                        target.ready = false;
                        target.pause();
                        other.currentTime = target.currentTime;
                        break;
                case "play":
                        other.currentTime = target.currentTime;
                        otherPlayManager.play();
                        break;
                case "pause":
                        other.currentTime = target.currentTime;
                        other.pause();
                        break;
                case "playing":
                        other.currentTime = target.currentTime;
                        break;
                case "ratechange":
                        other.playbackRate = target.playbackRate;
                        break;
                }
        }
}

for (let eventName of ["pause", "play", "seeked"]) {
        video.addEventListener(eventName, playbackIntervention)
}
for (let eventName of ["canplaythrough", "waiting", "stalled", "ratechange"]) {
        video.addEventListener(eventName, playbackIntervention)
        audio.addEventListener(eventName, playbackIntervention)
}

function relativeSeek(seconds) {
        video.currentTime += seconds
}

function playVideo() {
        audio.currentTime = video.currentTime
        let lastTime = video.currentTime
        ignoreNext.play++
        video.play().then(() => {
                const interval = setInterval(() => {
                        console.log("checking video", video.currentTime, lastTime)
                        if (video.currentTime !== lastTime) {
                                clearInterval(interval)
                                playManagers.audio.play()
                                return
                        }
                }, 15)
        })
}

function togglePlaying() {
        if (video.paused) playVideo()
        else video.pause()
}

function toggleFullScreen() {
        if (document.fullscreen) document.exitFullscreen()
        else video.requestFullscreen()
}

video.addEventListener("click", event => {
        event.preventDefault()
        togglePlaying()
})

video.addEventListener("dblclick", event => {
        event.preventDefault()
        toggleFullScreen()
})

document.addEventListener("keydown", event => {
        if (["INPUT", "SELECT", "BUTTON"].includes(event.target.tagName)) return
        if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return
        let caught = true
        if (event.key === "j" || event.key === "n") {
                relativeSeek(-10)
        } else if (["k", "p", " ", "e"].includes(event.key)) {
                togglePlaying()
        } else if (event.key === "l" || event.key === "o") {
                relativeSeek(10)
        } else if (event.key === "ArrowLeft") {
                relativeSeek(-5)
        } else if (event.key === "ArrowRight") {
                relativeSeek(5)
        } else if (event.key >= "0" && event.key <= "9") {
                video.currentTime = video.duration * (+event.key) / 10
        } else if (event.key === "f") {
                toggleFullScreen()
        } else {
                caught = false
        }
        if (caught) event.preventDefault()
})

new SubscribeButton(q("#subscribe"))

const timestamps = qa("[data-clickable-timestamp]")

class Timestamp extends ElemJS {
        constructor(element) {
                super(element)
                this.on("click", this.onClick.bind(this))
        }

        onClick(event) {
                event.preventDefault()
                video.currentTime = event.target.getAttribute("data-clickable-timestamp")
                window.history.replaceState(null, "", event.target.href)
        }
}

timestamps.forEach(el => {
        new Timestamp(el)
})
