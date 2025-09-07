uniform vec3 uSunPosition;
uniform vec3 uColor;
uniform sampler2D uTexture;

varying vec3 vGameNormal;
varying vec2 vUv;

#include ../partials/getSunShade.glsl;
#include ../partials/getSunShadeColor.glsl;

void main()
{
    vec3 textureColor = texture2D(uTexture, vUv).rgb;
    // 降低贴图影响，保留为轻微的色彩与细节
    vec3 color = mix(uColor, textureColor, 0.2);

    float sunShade = getSunShade(vGameNormal);
    color = getSunShadeColor(color, sunShade);
    
    gl_FragColor = vec4(color, 1.0);
    // gl_FragColor = vec4(vColor, 1.0);
}