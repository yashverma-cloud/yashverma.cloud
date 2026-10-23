import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  OrthographicCamera,
  type Material,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';

/** One triangle that covers the viewport; cheaper than a quad, with no diagonal seam. */
const TRIANGLE = new BufferGeometry();
TRIANGLE.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));

export const FULLSCREEN_VERT = /* glsl */ `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const CAMERA = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

export class FullscreenPass {
  readonly mesh: Mesh;

  constructor(material: Material) {
    this.mesh = new Mesh(TRIANGLE, material);
    this.mesh.frustumCulled = false;
  }

  get material(): Material {
    return this.mesh.material as Material;
  }

  render(renderer: WebGLRenderer, target: WebGLRenderTarget | null, layer = 0): void {
    renderer.setRenderTarget(target, layer);
    renderer.render(this.mesh, CAMERA);
  }

  dispose(): void {
    (this.mesh.material as Material).dispose();
  }
}
