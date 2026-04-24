import * as THREE from "three";

export type AstroNodeType = "planet" | "blackhole" | "neutronstar" | "pulsar";

/**
 * Classify node as astronomical type based on category and importance
 */
export function classifyAstroNode(
  category: string,
  riskLevel: string,
  importance: number
): AstroNodeType {
  // High-risk files are black holes
  if (riskLevel === "high") return "blackhole";

  // Entry points are pulsars (rotating, dynamic)
  if (category === "entry") return "pulsar";

  // Small but important utilities are neutron stars (dense, intense)
  if (category === "utility" && importance > 0.6) return "neutronstar";

  // Everything else is planets
  return "planet";
}

/**
 * Create vertex shader for node visualization
 */
export function createNodeVertexShader(nodeType: AstroNodeType): string {
  const baseShader = `
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying float vTime;

    uniform float uTime;
    uniform float uAnimationIntensity;

    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      vTime = uTime;

      vec3 pos = position;
  `;

  const animationShaders: Record<AstroNodeType, string> = {
    planet: `
      // Subtle wobble animation for planets
      pos += normalize(normal) * sin(uTime * 0.8 + position.x * 2.0) * 0.03 * uAnimationIntensity;
    `,
    blackhole: `
      // Inward pull effect (subtle)
      pos *= 1.0 - 0.015 * sin(uTime * 1.2) * uAnimationIntensity;
    `,
    neutronstar: `
      // Fast pulsing contraction
      pos *= 1.0 - 0.02 * abs(sin(uTime * 2.5)) * uAnimationIntensity;
    `,
    pulsar: `
      // Rotation around Y axis
      float angle = uTime * 1.8 * uAnimationIntensity;
      float s = sin(angle);
      float c = cos(angle);
      pos = vec3(pos.x * c - pos.z * s, pos.y, pos.x * s + pos.z * c);
    `,
  };

  return baseShader + animationShaders[nodeType] + `
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;
}

/**
 * Create fragment shader for node visualization
 */
export function createNodeFragmentShader(nodeType: AstroNodeType): string {
  const baseShader = `
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying float vTime;

    uniform vec3 uColor;
    uniform float uEmissiveIntensity;
    uniform float uAnimationIntensity;
    uniform float uOpacity;
  `;

  const effectShaders: Record<AstroNodeType, string> = {
    planet: `
      return vec3(uColor);
    `,
    blackhole: `
      return vec3(uColor * 0.95);
    `,
    neutronstar: `
      return vec3(uColor * 1.05);
    `,
    pulsar: `
      return vec3(uColor);
    `,
  };

  return baseShader + `
    void main() {
      vec3 color ${effectShaders[nodeType]};

      // Add base emissive
      color += uColor * uEmissiveIntensity;

      gl_FragColor = vec4(color, uOpacity);
    }
  `;
}

/**
 * Create custom material for astronomical node
 */
export function createAstroMaterial(
  nodeType: AstroNodeType,
  baseColor: THREE.Color,
  emissiveColor: THREE.Color,
  emissiveIntensity: number,
  opacity: number = 1.0
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: baseColor },
      uEmissiveIntensity: { value: emissiveIntensity },
      uAnimationIntensity: { value: 1.0 },
      uOpacity: { value: opacity },
    },
    vertexShader: createNodeVertexShader(nodeType),
    fragmentShader: createNodeFragmentShader(nodeType),
    transparent: true,
    side: THREE.FrontSide,
    depthWrite: opacity >= 1.0,
  });
}
