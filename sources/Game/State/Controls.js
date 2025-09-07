import EventsEmitter from 'events'

import Game from '@/Game.js'
import State from '@/State/State.js'

export default class Controls
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()

        this.events = new EventsEmitter()

        this.setKeys()
        this.setPointer()

        this.events.on('debugDown', () =>
        {
            if(location.hash === '#debug')
                location.hash = ''
            else
                location.hash = 'debug'

            location.reload()
        })
    }

    setKeys()
    {
        this.keys = {}
        
        // Map
        this.keys.map = [
            {
                codes: [ 'ArrowUp', 'KeyW' ],
                name: 'forward'
            },
            {
                codes: [ 'ArrowRight', 'KeyD' ],
                name: 'strafeRight'
            },
            {
                codes: [ 'ArrowDown', 'KeyS' ],
                name: 'backward'
            },
            {
                codes: [ 'ArrowLeft', 'KeyA' ],
                name: 'strafeLeft'
            },
            {
                codes: [ 'ShiftLeft', 'ShiftRight' ],
                name: 'boost'
            },
            {
                codes: [ 'KeyP' ],
                name: 'pointerLock'
            },
            {
                codes: [ 'KeyV' ],
                name: 'cameraMode'
            },
            {
                codes: [ 'KeyB' ],
                name: 'debug'
            },
            {
                codes: [ 'KeyF' ],
                name: 'fullscreen'
            },
            {
                codes: [ 'Space' ],
                name: 'jump'
            },
            {
                codes: [ 'ControlLeft', 'KeyC' ],
                name: 'crouch'
            },
        ]

        // Down keys
        this.keys.down = {}

        for(const mapItem of this.keys.map)
        {
            this.keys.down[mapItem.name] = false
        }

        // Find in map per code
        this.keys.findPerCode = (key) =>
        {
            return this.keys.map.find((mapItem) => mapItem.codes.includes(key))
        }

        // Event
        window.addEventListener('keydown', (event) =>
        {
            const mapItem = this.keys.findPerCode(event.code)
            
            if(mapItem)
            {
                this.events.emit('keyDown', mapItem.name)
                this.events.emit(`${mapItem.name}Down`)
                this.keys.down[mapItem.name] = true
            }
        })

        window.addEventListener('keyup', (event) =>
        {
            const mapItem = this.keys.findPerCode(event.code)
            
            if(mapItem)
            {
                this.events.emit('keyUp', mapItem.name)
                this.events.emit(`${mapItem.name}Up`)
                this.keys.down[mapItem.name] = false
            }
        })
    }

    setPointer()
    {
        this.pointer = {}
        this.pointer.down = false
        this.pointer.deltaTemp = { x: 0, y: 0 }
        this.pointer.delta = { x: 0, y: 0 }
        this.pointer.smooth = { x: 0, y: 0 }
        this.pointerLockEnabled = false
        this.pointer.smoothing = 0.2 // 越大越贴合输入，越小越平滑
        this.pointer.maxDelta = 80   // 阈值，防止瞬移

        // 自动启用指针锁定
        this.enablePointerLock()

        window.addEventListener('pointerdown', (event) =>
        {
            this.pointer.down = true
            // 点击时自动启用指针锁定
            if (!this.pointerLockEnabled) {
                this.enablePointerLock()
            }
        })

        window.addEventListener('pointermove', (event) =>
        {
            // 只有在指针锁定时才处理鼠标移动
            if (this.pointerLockEnabled) {
                this.pointer.deltaTemp.x += event.movementX
                this.pointer.deltaTemp.y += event.movementY
            }
        })

        window.addEventListener('pointerup', () =>
        {
            this.pointer.down = false
        })

        // 监听指针锁定状态变化
        document.addEventListener('pointerlockchange', () =>
        {
            this.pointerLockEnabled = document.pointerLockElement === document.body
            // 避免进入/退出指针锁定时出现的大delta尖峰
            this.pointer.deltaTemp.x = 0
            this.pointer.deltaTemp.y = 0
            this.pointer.smooth.x = 0
            this.pointer.smooth.y = 0
            this.pointer.delta.x = 0
            this.pointer.delta.y = 0
        })

        // 监听ESC键退出指针锁定
        window.addEventListener('keydown', (event) =>
        {
            if (event.code === 'Escape' && this.pointerLockEnabled)
            {
                document.exitPointerLock()
            }
        })
    }

    enablePointerLock()
    {
        if (!this.pointerLockEnabled) {
            document.body.requestPointerLock()
        }
    }

    update()
    {
        // 限幅避免偶发的巨大跳变
        const dxClamped = Math.max(- this.pointer.maxDelta, Math.min(this.pointer.maxDelta, this.pointer.deltaTemp.x))
        const dyClamped = Math.max(- this.pointer.maxDelta, Math.min(this.pointer.maxDelta, this.pointer.deltaTemp.y))

        // 指数平滑，降低抖动和跳变
        const a = this.pointer.smoothing
        this.pointer.smooth.x = this.pointer.smooth.x * (1 - a) + dxClamped * a
        this.pointer.smooth.y = this.pointer.smooth.y * (1 - a) + dyClamped * a

        this.pointer.delta.x = this.pointer.smooth.x
        this.pointer.delta.y = this.pointer.smooth.y

        this.pointer.deltaTemp.x = 0
        this.pointer.deltaTemp.y = 0
    }
}