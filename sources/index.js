import Game from '@/Game.js'
import bgmUrl from '../shit.mp3'

const game = new Game()

if(game.view)
    document.querySelector('.game').append(game.view.renderer.instance.domElement)

// Background music (plays on first user interaction to satisfy autoplay policies)
const backgroundMusic = new Audio(bgmUrl)
backgroundMusic.loop = true
backgroundMusic.volume = 0.5

const startBackgroundMusic = () =>
{
    console.log('开始播放背景音乐:', bgmUrl)
    backgroundMusic.play().catch((e) => {
        console.error('背景音乐播放失败:', e)
    })
    window.removeEventListener('pointerdown', startBackgroundMusic)
    window.removeEventListener('keydown', startBackgroundMusic)
    window.removeEventListener('touchstart', startBackgroundMusic)
}

window.addEventListener('pointerdown', startBackgroundMusic, { once: true })
window.addEventListener('keydown', startBackgroundMusic, { once: true })
window.addEventListener('touchstart', startBackgroundMusic, { once: true })