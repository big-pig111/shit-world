import { vec3 } from 'gl-matrix'
import * as THREE from 'three'
import jumpSfxUrl from '../../../tiao.mp3'
import sprintSfxUrl from '../../../shift.mp3'

import Game from '@/Game.js'
import State from '@/State/State.js'
import Camera from './Camera.js'

export default class Player
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.time = this.state.time
        this.controls = this.state.controls

        this.rotation = 0
        this.inputSpeed = 10
        this.inputBoostSpeed = 30
        this.speed = 0

        // 跳跃相关属性
        this.velocity = {}
        this.velocity.y = 0
        this.jumpPower = 15
        this.baseGravity = -30
        this.gravity = this.baseGravity
        this.maxGravity = -120  // 增加最大重力加速度
        this.gravityAcceleration = 1.5  // 增加重力随时间增加的系数
        this.airTime = 0  // 空中时间
        this.isGrounded = false
        this.wasGrounded = true  // 上一帧是否在地面
        this.groundCheckDistance = 0.1
        this.capsuleHalfHeight = 0.5
        this.capsuleRadius = 0.35 // 胶囊体半径，用于地形采样
        this.horizontalSubstep = 0.25 // 每个子步的最大水平移动，用于避免穿透
        this.maxStepUp = 0.45 // 单个子步允许的最大向上台阶
        this.stepDownTolerance = 0.2 // 允许轻微向下吸附

        this.position = {}
        this.position.current = vec3.fromValues(10, 0, 1)
        this.position.previous = vec3.clone(this.position.current)
        this.position.delta = vec3.create()

        this.camera = new Camera(this)
        
        // 音效：跳跃（单次）与冲刺（循环）
        this.audio = {}
        console.log('加载跳跃音效:', jumpSfxUrl)
        console.log('加载冲刺音效:', sprintSfxUrl)
        this.audio.jump = new Audio(jumpSfxUrl)
        this.audio.jump.volume = 0.7
        this.audio.sprint = new Audio(sprintSfxUrl)
        this.audio.sprint.loop = true
        this.audio.sprint.volume = 0.5
        this.isSprintSoundPlaying = false

        // 着陆特效
        this.landingEffects = []
        this.maxLandingEffects = 3
        
        // 起跳特效
        this.jumpEffects = []
        this.maxJumpEffects = 2
    }

    update()
    {
        // 水平移动
        if(this.camera.mode !== Camera.MODE_FLY && (this.controls.keys.down.forward || this.controls.keys.down.backward || this.controls.keys.down.strafeLeft || this.controls.keys.down.strafeRight))
        {
            this.rotation = this.camera.thirdPerson.theta

            if(this.controls.keys.down.forward)
            {
                if(this.controls.keys.down.strafeLeft)
                    this.rotation += Math.PI * 0.25
                else if(this.controls.keys.down.strafeRight)
                    this.rotation -= Math.PI * 0.25
            }
            else if(this.controls.keys.down.backward)
            {
                if(this.controls.keys.down.strafeLeft)
                    this.rotation += Math.PI * 0.75
                else if(this.controls.keys.down.strafeRight)
                    this.rotation -= Math.PI * 0.75
                else
                    this.rotation -= Math.PI
            }
            else if(this.controls.keys.down.strafeLeft)
            {
                this.rotation += Math.PI * 0.5
            }
            else if(this.controls.keys.down.strafeRight)
            {
                this.rotation -= Math.PI * 0.5
            }

            const speed = this.controls.keys.down.boost ? this.inputBoostSpeed : this.inputSpeed

            const dx = - Math.sin(this.rotation) * this.time.delta * speed
            const dz = - Math.cos(this.rotation) * this.time.delta * speed

            // 子步移动，避免高速穿透上坡
            const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / this.horizontalSubstep))
            const stepx = dx / steps
            const stepz = dz / steps

            for(let i = 0; i < steps; i++)
            {
                this.position.current[0] += stepx
                this.position.current[2] += stepz
                this.snapToGroundDuringMove()
                // 防止水平推入陡坡
                this.clampTerrainPenetration()
            }
        }

        // 跳跃逻辑
        this.handleJump()

        // 更新空中时间和重力
        if (!this.isGrounded) {
            this.airTime += this.time.delta
            // 重力随时间增加，模拟真实物理
            this.gravity = Math.max(this.maxGravity, this.baseGravity - this.airTime * this.gravityAcceleration)
        } else {
            this.airTime = 0
            this.gravity = this.baseGravity
        }

        // 应用重力
        this.velocity.y += this.gravity * this.time.delta
        this.position.current[1] += this.velocity.y * this.time.delta

        // 保存着陆前的速度用于特效计算
        const velocityBeforeGroundCheck = this.velocity.y

        // 垂直更新后再做一次穿入夹取，避免跳入斜坡
        this.clampTerrainPenetration()

        // 地面检测
        this.checkGround()

        // 检测着陆
        if (this.isGrounded && !this.wasGrounded) {
            console.log('着陆检测触发! 着陆前速度Y:', velocityBeforeGroundCheck)
            this.onLanding(velocityBeforeGroundCheck)
        }
        this.wasGrounded = this.isGrounded

        vec3.sub(this.position.delta, this.position.current, this.position.previous)
        vec3.copy(this.position.previous, this.position.current)

        this.speed = vec3.len(this.position.delta)
        
        // Update view
        this.camera.update()

        // 更新着陆特效
        this.updateLandingEffects()
        
        // 更新起跳特效
        this.updateJumpEffects()

        // 冲刺音效：按住加速键并移动时播放，否则暂停
        const isBoosting = this.controls.keys.down.boost
        const isMoving = (this.controls.keys.down.forward || this.controls.keys.down.backward || this.controls.keys.down.strafeLeft || this.controls.keys.down.strafeRight)
        const shouldPlaySprint = isBoosting && isMoving && this.camera.mode !== Camera.MODE_FLY

        if(shouldPlaySprint)
        {
            if(!this.isSprintSoundPlaying)
            {
                try
                {
                    this.audio.sprint.currentTime = 0
                    this.audio.sprint.play()
                    this.isSprintSoundPlaying = true
                }
                catch(e){}
            }
        }
        else if(this.isSprintSoundPlaying)
        {
            try
            {
                this.audio.sprint.pause()
                this.isSprintSoundPlaying = false
            }
            catch(e){}
        }
    }

    handleJump()
    {
        // 检查是否按下跳跃键且在地面上
        if(this.controls.keys.down.jump && this.isGrounded)
        {
            this.velocity.y = this.jumpPower
            this.isGrounded = false

            // 跳跃音效：每次跳跃时立即触发
            try
            {
                this.audio.jump.currentTime = 0
                this.audio.jump.play()
            }
            catch(e){}
            
            // 创建起跳特效
            this.createJumpEffect()
        }
    }

    // 在水平子步移动时尝试与地面吸附，防止卡进地形
    snapToGroundDuringMove()
    {
        const chunks = this.state.chunks
        const elevation = chunks.getElevationForPosition(this.position.current[0], this.position.current[2])
        if(elevation === false)
            return

        const desiredBottom = elevation
        const currentBottom = this.position.current[1] - this.capsuleHalfHeight
        const delta = desiredBottom - currentBottom

        // 允许小幅上台阶或下台阶吸附（仅在下降时）
        if(this.velocity.y <= 0)
        {
            if(delta > 0 && delta <= this.maxStepUp)
            {
                // 上台阶：抬高到地面
                this.position.current[1] += delta
                this.isGrounded = true
                this.velocity.y = 0
            }
            else if(delta < 0 && delta >= - this.stepDownTolerance)
            {
                // 轻微向下吸附
                this.position.current[1] += delta
                this.isGrounded = true
                this.velocity.y = 0
            }
        }
    }

    // 基于胶囊体半径进行多点地形采样，并夹取穿入
    clampTerrainPenetration()
    {
        const chunks = this.state.chunks
        const x = this.position.current[0]
        const z = this.position.current[2]

        const r = this.capsuleRadius
        const samplePoints = [
            [x, z],
            [x + r, z],
            [x - r, z],
            [x, z + r],
            [x, z - r],
            [x + r * 0.707, z + r * 0.707],
            [x - r * 0.707, z + r * 0.707],
            [x + r * 0.707, z - r * 0.707],
            [x - r * 0.707, z - r * 0.707]
        ]

        let maxElevation = - Infinity
        for(const [sx, sz] of samplePoints)
        {
            const e = chunks.getElevationForPosition(sx, sz)
            if(e !== false)
                maxElevation = Math.max(maxElevation, e)
        }

        if(maxElevation === - Infinity)
            return

        const bottomY = this.position.current[1] - this.capsuleHalfHeight
        const penetration = maxElevation - bottomY

        // 若底部穿入，则抬高到表面
        if(penetration > 0)
        {
            this.position.current[1] += penetration
            if(this.velocity.y < 0)
                this.velocity.y = 0
            this.isGrounded = true
        }
    }

    checkGround()
    {
        const chunks = this.state.chunks
        const elevation = chunks.getElevationForPosition(this.position.current[0], this.position.current[2])
        
        if(elevation !== false)
        {
            const groundY = elevation
            const playerBottom = this.position.current[1] - this.capsuleHalfHeight // 玩家底部位置
            
            // 检查是否接触地面
            if(playerBottom <= groundY + this.groundCheckDistance && this.velocity.y <= 0)
            {
                this.position.current[1] = groundY + this.capsuleHalfHeight
                this.velocity.y = 0
                this.isGrounded = true
            }
            else
            {
                this.isGrounded = false
            }
        }
        else
        {
            // 如果没有地形，检查是否在地面高度
            if(this.position.current[1] <= this.capsuleHalfHeight + this.groundCheckDistance && this.velocity.y <= 0)
            {
                this.position.current[1] = this.capsuleHalfHeight
                this.velocity.y = 0
                this.isGrounded = true
            }
            else
            {
                this.isGrounded = false
            }
        }
    }

    onLanding(velocityBeforeGroundCheck)
    {
        // 根据着陆前的下落速度计算着陆强度
        const fallSpeed = Math.abs(velocityBeforeGroundCheck)
        const impactStrength = Math.min(1, fallSpeed / 15) // 标准化冲击强度，降低分母让特效更容易触发
        
        console.log('着陆检测! 下落速度:', fallSpeed, '冲击强度:', impactStrength)
        
        if (impactStrength > 0.05) { // 进一步降低阈值
            console.log('创建着陆特效')
            this.createLandingEffect(impactStrength)
        }
    }

    createLandingEffect(strength)
    {
        console.log('创建着陆特效，强度:', strength)
        
        // 获取view实例
        const view = this.game.view
        if (!view || !view.scene) {
            console.error('View或scene未初始化')
            return
        }
        
        // 限制同时存在的特效数量
        if (this.landingEffects.length >= this.maxLandingEffects) {
            const oldEffect = this.landingEffects.shift()
            if (oldEffect && oldEffect.mesh) {
                view.scene.remove(oldEffect.mesh)
                if (oldEffect.mesh.geometry) oldEffect.mesh.geometry.dispose()
                if (oldEffect.mesh.material) oldEffect.mesh.material.dispose()
            }
        }

        // 创建多个粒子
        const particleCount = Math.floor(5 + strength * 8) // 5-13个粒子
        for (let i = 0; i < particleCount; i++) {
            const effect = {
                position: vec3.clone(this.position.current),
                velocity: vec3.fromValues(
                    (Math.random() - 0.5) * 6 * strength,
                    Math.random() * 3 * strength,
                    (Math.random() - 0.5) * 6 * strength
                ),
                life: 1.5, // 延长生命时间
                maxLife: 1.5,
                size: 0.1 + Math.random() * 0.3 * strength, // 更大的粒子
                opacity: 0.9 * strength
            }

            // 创建粒子网格
            const geometry = new THREE.SphereGeometry(effect.size, 12, 8)
            const material = new THREE.MeshBasicMaterial({
                color: new THREE.Color(0.9, 0.8, 0.6), // 更亮的尘土色
                transparent: true,
                opacity: effect.opacity
            })
            effect.mesh = new THREE.Mesh(geometry, material)
            effect.mesh.position.set(effect.position[0], effect.position[1], effect.position[2])
            
            view.scene.add(effect.mesh)
            this.landingEffects.push(effect)
        }
        
        console.log('已创建', particleCount, '个着陆粒子')
    }

    updateLandingEffects()
    {
        const view = this.game.view
        if (!view || !view.scene) return
        
        for (let i = this.landingEffects.length - 1; i >= 0; i--) {
            const effect = this.landingEffects[i]
            
            // 更新位置
            effect.position[0] += effect.velocity[0] * this.time.delta
            effect.position[1] += effect.velocity[1] * this.time.delta
            effect.position[2] += effect.velocity[2] * this.time.delta
            
            // 应用重力
            effect.velocity[1] -= 20 * this.time.delta
            
            // 更新网格位置
            effect.mesh.position.set(effect.position[0], effect.position[1], effect.position[2])
            
            // 更新生命值
            effect.life -= this.time.delta
            const lifeRatio = effect.life / effect.maxLife
            
            // 淡出效果
            effect.mesh.material.opacity = effect.opacity * lifeRatio
            effect.mesh.scale.setScalar(lifeRatio)
            
            // 移除死亡的特效
            if (effect.life <= 0) {
                view.scene.remove(effect.mesh)
                effect.mesh.geometry.dispose()
                effect.mesh.material.dispose()
                this.landingEffects.splice(i, 1)
            }
        }
    }

    createJumpEffect()
    {
        console.log('创建起跳特效')
        
        // 获取view实例
        const view = this.game.view
        if (!view || !view.scene) {
            console.error('View或scene未初始化')
            return
        }
        
        // 限制同时存在的特效数量
        if (this.jumpEffects.length >= this.maxJumpEffects) {
            const oldEffect = this.jumpEffects.shift()
            if (oldEffect && oldEffect.mesh) {
                view.scene.remove(oldEffect.mesh)
                if (oldEffect.mesh.geometry) oldEffect.mesh.geometry.dispose()
                if (oldEffect.mesh.material) oldEffect.mesh.material.dispose()
            }
        }

        // 创建多个向上飞溅的粒子
        const particleCount = 6 // 起跳粒子数量
        for (let i = 0; i < particleCount; i++) {
            const effect = {
                position: vec3.clone(this.position.current),
                velocity: vec3.fromValues(
                    (Math.random() - 0.5) * 2, // 水平扩散
                    Math.random() * 3 + 1,     // 向上飞溅
                    (Math.random() - 0.5) * 2  // 水平扩散
                ),
                life: 1.0,
                maxLife: 1.0,
                size: 0.08 + Math.random() * 0.12,
                opacity: 0.7
            }

            // 创建粒子网格
            const geometry = new THREE.SphereGeometry(effect.size, 8, 6)
            const material = new THREE.MeshBasicMaterial({
                color: new THREE.Color(0.7, 0.8, 0.9), // 淡蓝色，类似空气/尘土
                transparent: true,
                opacity: effect.opacity
            })
            effect.mesh = new THREE.Mesh(geometry, material)
            effect.mesh.position.set(effect.position[0], effect.position[1], effect.position[2])
            
            view.scene.add(effect.mesh)
            this.jumpEffects.push(effect)
        }
        
        console.log('已创建', particleCount, '个起跳粒子')
    }

    updateJumpEffects()
    {
        const view = this.game.view
        if (!view || !view.scene) return
        
        for (let i = this.jumpEffects.length - 1; i >= 0; i--) {
            const effect = this.jumpEffects[i]
            
            // 更新位置
            effect.position[0] += effect.velocity[0] * this.time.delta
            effect.position[1] += effect.velocity[1] * this.time.delta
            effect.position[2] += effect.velocity[2] * this.time.delta
            
            // 应用重力（向上飞溅的粒子也会受重力影响）
            effect.velocity[1] -= 15 * this.time.delta
            
            // 更新网格位置
            effect.mesh.position.set(effect.position[0], effect.position[1], effect.position[2])
            
            // 更新生命值
            effect.life -= this.time.delta
            const lifeRatio = effect.life / effect.maxLife
            
            // 淡出效果
            effect.mesh.material.opacity = effect.opacity * lifeRatio
            effect.mesh.scale.setScalar(lifeRatio)
            
            // 移除死亡的特效
            if (effect.life <= 0) {
                view.scene.remove(effect.mesh)
                effect.mesh.geometry.dispose()
                effect.mesh.material.dispose()
                this.jumpEffects.splice(i, 1)
            }
        }
    }
}