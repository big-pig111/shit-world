import * as THREE from 'three'

import Game from '@/Game.js'
import View from '@/View/View.js'
import Debug from '@/Debug/Debug.js'
import State from '@/State/State.js'
import PlayerMaterial from './Materials/PlayerMaterial.js'

export default class Player
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.view = View.getInstance()
        this.debug = Debug.getInstance()

        this.scene = this.view.scene

        this.setGroup()
        this.setHelper()
        this.setDebug()
    }

    setGroup()
    {
        this.group = new THREE.Group()
        this.scene.add(this.group)
    }
    
    setHelper()
    {
        this.helper = new THREE.Mesh()
        this.helper.material = new PlayerMaterial()
        this.helper.material.uniforms.uColor.value = new THREE.Color('#8B4513') // 棕色便便颜色
        this.helper.material.uniforms.uSunPosition.value = new THREE.Vector3(- 0.5, - 0.5, - 0.5)

        // Load texture
        const textureLoader = new THREE.TextureLoader()
        const texture = textureLoader.load('./1.png')
        texture.wrapS = THREE.ClampToEdgeWrapping
        texture.wrapT = THREE.ClampToEdgeWrapping
        this.helper.material.uniforms.uTexture.value = texture

        // 创建便便形状的几何体（Lathe + 扭转）
        this.helper.geometry = this.createPoopGeometry()
        // 底部对齐到 y=0
        this.helper.geometry.computeBoundingBox()
        if(this.helper.geometry.boundingBox)
        {
            const minY = this.helper.geometry.boundingBox.min.y
            this.helper.geometry.translate(0, - minY, 0)
        }
        this.group.add(this.helper)

        // 添加顶部的小草装饰
        this.grass = new THREE.Mesh()
        this.grass.geometry = this.createGrassGeometry()
        this.grass.material = new THREE.MeshBasicMaterial({ color: '#228B22' }) // 绿色
        // 放置在便便顶部
        this.helper.geometry.computeBoundingBox()
        if(this.helper.geometry.boundingBox)
            this.grass.position.set(0, this.helper.geometry.boundingBox.max.y + 0.05, 0)
        this.group.add(this.grass)

        // 添加表情（3D化图片的眼睛、腮红、微笑）
        this.addFace()

        // const arrow = new THREE.Mesh(
        //     new THREE.ConeGeometry(0.2, 0.2, 4),
        //     new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: false })
        // )
        // arrow.rotation.x = - Math.PI * 0.5
        // arrow.position.y = 1.5
        // arrow.position.z = - 0.5
        // this.helper.add(arrow)
        
        // // Axis helper
        // this.axisHelper = new THREE.AxesHelper(3)
        // this.group.add(this.axisHelper)
    }

    addFace()
    {
        // 使用包围盒估计面部位置和尺寸
        this.helper.geometry.computeBoundingBox()
        const bb = this.helper.geometry.boundingBox
        const height = bb ? (bb.max.y - bb.min.y) : 1
        const faceY = bb ? (bb.min.y + height * 0.55) : 0.7
        const faceZ = 0.38 // 估计前表面半径

        const faceGroup = new THREE.Group()
        faceGroup.position.set(0, 0, 0)
        this.helper.add(faceGroup)

        // 眼睛
        const eyeGeom = new THREE.SphereGeometry(0.055, 16, 16)
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 })
        const leftEye = new THREE.Mesh(eyeGeom, eyeMat)
        const rightEye = new THREE.Mesh(eyeGeom, eyeMat)
        leftEye.position.set(- 0.14, faceY + 0.02, faceZ)
        rightEye.position.set(0.14, faceY + 0.02, faceZ)
        faceGroup.add(leftEye)
        faceGroup.add(rightEye)

        // 腮红
        const blushGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.02, 24)
        const blushMat = new THREE.MeshBasicMaterial({ color: 0xff7d8a })
        const leftBlush = new THREE.Mesh(blushGeom, blushMat)
        const rightBlush = new THREE.Mesh(blushGeom, blushMat)
        leftBlush.rotation.x = Math.PI * 0.5
        rightBlush.rotation.x = Math.PI * 0.5
        leftBlush.position.set(- 0.22, faceY - 0.02, faceZ + 0.005)
        rightBlush.position.set(0.22, faceY - 0.02, faceZ + 0.005)
        faceGroup.add(leftBlush)
        faceGroup.add(rightBlush)

        // 微笑（部分圆环）
        const mouthGeom = new THREE.TorusGeometry(0.14, 0.02, 12, 64, Math.PI * 0.8)
        const mouthMat = new THREE.MeshBasicMaterial({ color: 0x111111 })
        const mouth = new THREE.Mesh(mouthGeom, mouthMat)
        mouth.rotation.x = Math.PI * 0.5
        mouth.position.set(0, faceY - 0.08, faceZ + 0.002)
        faceGroup.add(mouth)
    }

    createPoopGeometry()
    {
        // 使用LatheGeometry基于轮廓生成顺滑的分层造型
        const height = 1.5
        const baseRadius = 0.65  // 大幅增加底部半径
        const layers = 5 // 增加层数，让便便更饱满
        const radialSegments = 64
        const profileSegments = 120

        const points = []

        for(let i = 0; i <= profileSegments; i++)
        {
            const t = i / profileSegments // 0..1 bottom->top

            // 分层半径曲线：更多层，每层更饱满
            const layerT = t * layers
            const layerIndex = Math.floor(Math.min(layers - 1, layerT))
            const intra = layerT - layerIndex // 层内插值 0..1

            // 每层的基准半径（底部更大，更符合便便形状）
            const baseByLayer = [
                baseRadius,                    // 底层最大 - 更宽
                baseRadius * 0.80,            // 第二层 - 稍微小一点
                baseRadius * 0.65,            // 第三层
                baseRadius * 0.50,            // 第四层
                baseRadius * 0.35             // 第五层 - 顶部更尖
            ]
            let r = baseByLayer[layerIndex]

            // 层内由下到上微缩，底部保持更宽
            const shrink = 0.20
            r *= (1.0 - shrink * (intra * intra))

            // 顶端收尖更明显
            const tip = Math.pow(t, 2.0)
            r *= (1.0 - tip * 0.45)

            // 底部添加更多起伏，让底部看起来更自然
            const bottomWave = t < 0.3 ? Math.sin(t * Math.PI * 4.0) * 0.12 : 0
            const topWave = t > 0.7 ? Math.sin(t * Math.PI * 3.0) * 0.06 : 0
            r *= 1.0 + bottomWave + topWave

            const y = t * height
            points.push(new THREE.Vector2(r, y))
        }

        const lathe = new THREE.LatheGeometry(points, radialSegments)

        // 添加更明显的扭转，底部稳定，顶部扭转
        const twistTurns = 2.2
        const pos = lathe.attributes.position
        const temp = new THREE.Vector3()
        for(let i = 0; i < pos.count; i++)
        {
            temp.fromBufferAttribute(pos, i)
            const t = temp.y / height
            // 底部扭转较少，顶部扭转更多
            const twist = t * t * twistTurns * Math.PI * 2.0
            const cos = Math.cos(twist)
            const sin = Math.sin(twist)
            const x = temp.x * cos - temp.z * sin
            const z = temp.x * sin + temp.z * cos

            // 底部偏移较少，顶部偏移更多，让底部更稳定
            const offset = (t - 0.3) * 0.15
            pos.setX(i, x + offset)
            pos.setZ(i, z)
        }

        lathe.computeVertexNormals()
        return lathe
    }

    createGrassGeometry()
    {
        const geometry = new THREE.BufferGeometry()
        
        const vertices = []
        const indices = []
        
        // 创建3片小草的几何体
        for(let i = 0; i < 3; i++)
        {
            const angle = (i / 3) * Math.PI * 2
            const x = Math.cos(angle) * 0.05
            const z = Math.sin(angle) * 0.05
            
            // 每片草有3个顶点（三角形）
            const baseIndex = i * 3
            
            // 底部中心点
            vertices.push(x, 0, z)
            // 左侧点
            vertices.push(x - 0.02, 0.15, z)
            // 右侧点
            vertices.push(x + 0.02, 0.15, z)
            
            // 三角形索引
            indices.push(baseIndex, baseIndex + 1, baseIndex + 2)
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
        geometry.setIndex(indices)
        
        return geometry
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        // Sphere
        const playerFolder = this.debug.ui.getFolder('view/player')

        playerFolder.addColor(this.helper.material.uniforms.uColor, 'value')
    }


    update()
    {
        const playerState = this.state.player
        const sunState = this.state.sun

        this.group.position.set(
            playerState.position.current[0],
            playerState.position.current[1],
            playerState.position.current[2]
        )
        
        // Helper
        this.helper.rotation.y = playerState.rotation
        this.helper.material.uniforms.uSunPosition.value.set(sunState.position.x, sunState.position.y, sunState.position.z)
    }
}
