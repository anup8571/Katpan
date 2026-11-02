import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Card, CameraView, Side } from '../game/types';
import { soundEngine } from '../game/audio';
import {
  getCardFrontTexture,
  getCardBackTexture,
  getCardStackEdgeTexture,
  getFeltTableTexture,
  getMahoganyWoodTextures,
  getSoftShadowTexture,
  getChipTexture,
} from '../game/cardGraphics';

const _targetCamPos = new THREE.Vector3();
const _targetCamLook = new THREE.Vector3();
const _currentLookAt = new THREE.Vector3(0, 0, 0);

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface ActiveTween {
  startTime: number;
  duration: number;
  onUpdate: (progress: number, ease: number) => void;
  onComplete: () => void;
}

const DECK1_POS = new THREE.Vector3(-2.15, 0.1, -1.55);
const DECK2_POS = new THREE.Vector3(-0.35, 0.1, -1.55);
const HUKAM_POS = new THREE.Vector3(2.05, 0.2, -1.55);
const PLAYER_MAT_POS = new THREE.Vector3(-1.85, 0.03, 1.2);
const DEALER_MAT_POS = new THREE.Vector3(1.85, 0.03, 1.2);

export class CasinoScene {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock: THREE.Clock;
  private isSoftwareGl: boolean;
  private frameId = 0;
  private destroyed = false;
  private resizeObserver: ResizeObserver | null = null;

  private currentCameraView: CameraView = 'felt';
  private baseCameraPresets: Record<CameraView, { pos: THREE.Vector3; look: THREE.Vector3 }> = {
    felt: {
      pos: new THREE.Vector3(0, 8.2, 5.2),
      look: new THREE.Vector3(0, 0, 0.15),
    },
    cinematic: {
      pos: new THREE.Vector3(0, 7.2, 8.6),
      look: new THREE.Vector3(0, 0.1, 0.1),
    },
    player: {
      pos: new THREE.Vector3(-1.5, 5.4, 4.8),
      look: new THREE.Vector3(-0.9, 0, 0.55),
    },
    pedestal: {
      pos: new THREE.Vector3(1.6, 4.6, 2.2),
      look: new THREE.Vector3(1.35, 0.2, -1.35),
    },
  };

  private pointerOffset = new THREE.Vector2(0, 0);
  private isDragging = false;
  private dragStart = new THREE.Vector2(0, 0);

  private tableGroup = new THREE.Group();
  private deck1MeshGroup = new THREE.Group();
  private deck2MeshGroup = new THREE.Group();
  private pointCardMesh: THREE.Group | null = null;
  private dealtCardsPlayer: THREE.Group[] = [];
  private dealtCardsDealer: THREE.Group[] = [];
  private winningCardHover: { group: THREE.Group; baseY: number; time: number } | null = null;
  private particles: Particle[] = [];
  private tweens: ActiveTween[] = [];
  private chipsGroup = new THREE.Group();
  private spotLight!: THREE.SpotLight;

  private cutTopHalfMesh: THREE.Mesh | null = null;
  private cutBottomHalfMesh: THREE.Mesh | null = null;

  private cardGeometry!: THREE.BoxGeometry;
  private cardShadowGeo!: THREE.PlaneGeometry;
  private cardShadowMat!: THREE.MeshBasicMaterial;
  private cardPaperEdgeMaterial!: THREE.MeshStandardMaterial;
  private cardStackEdgeMaterial!: THREE.MeshStandardMaterial;
  private cardBackRedMaterial!: THREE.MeshStandardMaterial;
  private cardBackBlueMaterial!: THREE.MeshStandardMaterial;

  constructor(container: HTMLElement) {
    this.container = container;

    this.isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#06090e');
    this.scene.fog = new THREE.FogExp2('#06090e', 0.022);

    const aspect = width / Math.max(height, 1);
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    this.computeAdaptiveCamera(this.currentCameraView, aspect, _targetCamPos, _targetCamLook);
    this.camera.position.copy(_targetCamPos);
    _currentLookAt.copy(_targetCamLook);
    this.camera.lookAt(_currentLookAt);

    this.clock = new THREE.Clock();

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    this.initCardResources();
    this.setupLighting();
    this.buildCasinoRoom();
    this.buildRoyalCasinoTable();
    this.buildCardShoesAndPedestal();
    this.buildChipStacks();
    this.buildDeckVisuals();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.onWindowResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.onWindowResize());
      this.resizeObserver.observe(this.container);
    }
    this.setupPointerControls();

    this.startLoop();
  }

  private runTween(
    durationSec: number,
    onUpdate: (progress: number, ease: number) => void
  ): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.push({
        startTime: performance.now(),
        duration: durationSec * 1000,
        onUpdate,
        onComplete: resolve,
      });
    });
  }

  private computeAdaptiveCamera(
    view: CameraView,
    aspect: number,
    outPos: THREE.Vector3,
    outLook: THREE.Vector3
  ) {
    const base = this.baseCameraPresets[view] || this.baseCameraPresets.felt;
    outPos.copy(base.pos);
    outLook.copy(base.look);

    if (aspect < 1.15) {
      const clampedAspect = Math.max(aspect, 0.42);
      if (view === 'felt') {
        const zoomOut = Math.min(2.05, 1.02 / clampedAspect);
        outPos.set(0, base.pos.y * zoomOut * 0.96, base.pos.z * zoomOut * 0.78);
        outLook.set(0, 0, 0.22);
      } else if (view === 'cinematic') {
        const zoomOut = Math.min(1.95, 1.0 / clampedAspect);
        outPos.set(0, base.pos.y * zoomOut * 0.95, base.pos.z * zoomOut * 0.85);
        outLook.set(0, 0.05, 0.15);
      } else if (view === 'player') {
        const zoomOut = Math.min(2.05, 1.04 / clampedAspect);
        outPos.set(0, base.pos.y * zoomOut * 0.94, base.pos.z * zoomOut * 0.92);
        outLook.set(0, 0, 0.25);
      } else if (view === 'pedestal') {
        const zoomOut = Math.min(1.85, 0.98 / clampedAspect);
        outPos.set(0.45, base.pos.y * zoomOut * 0.95, base.pos.z * zoomOut * 1.05);
        outLook.set(0.45, 0.1, -0.85);
      }
    }

    outPos.x += this.pointerOffset.x * 0.65;
    outPos.z += this.pointerOffset.y * 0.45;
  }

  private setupPointerControls() {
    const dom = this.renderer.domElement;
    const onPointerDown = (e: PointerEvent) => {
      this.isDragging = true;
      this.dragStart.set(e.clientX, e.clientY);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!this.isDragging) return;
      const dx = (e.clientX - this.dragStart.x) / Math.max(window.innerWidth, 300);
      const dy = (e.clientY - this.dragStart.y) / Math.max(window.innerHeight, 300);
      this.pointerOffset.x = THREE.MathUtils.clamp(-dx * 2.2, -1.2, 1.2);
      this.pointerOffset.y = THREE.MathUtils.clamp(-dy * 1.8, -1.0, 1.0);
    };
    const onPointerUp = () => {
      this.isDragging = false;
    };

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  private initCardResources() {
    this.cardGeometry = new THREE.BoxGeometry(1.18, 0.014, 1.66);

    this.cardShadowGeo = new THREE.PlaneGeometry(1.42, 1.92);
    this.cardShadowMat = new THREE.MeshBasicMaterial({
      map: getSoftShadowTexture(),
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });

    this.cardPaperEdgeMaterial = new THREE.MeshStandardMaterial({
      color: 0xf5f3eb,
      roughness: 0.75,
      metalness: 0.02,
    });

    const stackTex = getCardStackEdgeTexture(this.renderer);
    this.cardStackEdgeMaterial = new THREE.MeshStandardMaterial({
      map: stackTex,
      roughness: 0.65,
      metalness: 0.04,
    });

    const redBackTex = getCardBackTexture('red', this.renderer);
    this.cardBackRedMaterial = new THREE.MeshStandardMaterial({
      map: redBackTex,
      color: 0xffffff,
      roughness: 0.28,
      metalness: 0.08,
    });

    const blueBackTex = getCardBackTexture('blue', this.renderer);
    this.cardBackBlueMaterial = new THREE.MeshStandardMaterial({
      map: blueBackTex,
      color: 0xffffff,
      roughness: 0.28,
      metalness: 0.08,
    });
  }

  private createCardGroup(frontCard: Card, backType: 'red' | 'blue' = 'red'): THREE.Group {
    const group = new THREE.Group();

    const frontTex = getCardFrontTexture(frontCard, this.renderer);
    const frontMat = new THREE.MeshStandardMaterial({
      map: frontTex,
      color: 0xffffff,
      roughness: 0.26,
      metalness: 0.04,
    });

    const backMat = backType === 'red' ? this.cardBackRedMaterial : this.cardBackBlueMaterial;

    const materials = [
      this.cardPaperEdgeMaterial,
      this.cardPaperEdgeMaterial,
      frontMat, // +Y face (Card Front)
      backMat,  // -Y face (Card Back)
      this.cardPaperEdgeMaterial,
      this.cardPaperEdgeMaterial,
    ];

    const cardMesh = new THREE.Mesh(this.cardGeometry, materials);
    cardMesh.castShadow = !this.isSoftwareGl;
    cardMesh.receiveShadow = !this.isSoftwareGl;
    group.add(cardMesh);

    const shadow = new THREE.Mesh(this.cardShadowGeo, this.cardShadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.009;
    group.add(shadow);

    return group;
  }

  private setupLighting() {
    this.spotLight = new THREE.SpotLight(0xfff4dc, 2.45);
    this.spotLight.position.set(0, 11.5, 1.5);
    this.spotLight.angle = Math.PI / 3.4;
    this.spotLight.penumbra = 0.65;
    this.spotLight.decay = 1.1;
    this.spotLight.castShadow = !this.isSoftwareGl;
    if (this.spotLight.castShadow) {
      this.spotLight.shadow.mapSize.width = 1024;
      this.spotLight.shadow.mapSize.height = 1024;
      this.spotLight.shadow.camera.near = 4;
      this.spotLight.shadow.camera.far = 18;
      this.spotLight.shadow.bias = -0.0005;
      this.spotLight.shadow.normalBias = 0.02;
    }
    this.scene.add(this.spotLight);

    const keyRimLight = new THREE.DirectionalLight(0xfde68a, 1.25);
    keyRimLight.position.set(5.5, 7.5, -4.5);
    this.scene.add(keyRimLight);

    const hemiLight = new THREE.HemisphereLight(0x334155, 0x052e16, 1.05);
    this.scene.add(hemiLight);

    const pedLight = new THREE.PointLight(0xfbbf24, 0.9, 8);
    pedLight.position.set(HUKAM_POS.x, 2.6, HUKAM_POS.z);
    this.scene.add(pedLight);
  }

  private buildCasinoRoom() {
    const floorGeo = new THREE.PlaneGeometry(40, 40);
    const { map: woodMap } = getMahoganyWoodTextures(this.renderer);
    const floorTex = woodMap.clone();
    floorTex.needsUpdate = true;
    floorTex.repeat.set(8, 8);

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      color: 0x33180e,
      roughness: 0.55,
      metalness: 0.1,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -3.1;
    floorMesh.receiveShadow = !this.isSoftwareGl;
    this.scene.add(floorMesh);
  }

  private buildRoyalCasinoTable() {
    const feltWidth = 8.8;
    const feltDepth = 6.6;

    const { map: feltMap, bumpMap: feltBump } = getFeltTableTexture(this.renderer);
    const feltGeo = new THREE.PlaneGeometry(feltWidth, feltDepth);
    const feltMat = new THREE.MeshStandardMaterial({
      map: feltMap,
      bumpMap: feltBump,
      bumpScale: 0.012,
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const feltMesh = new THREE.Mesh(feltGeo, feltMat);
    feltMesh.rotation.x = -Math.PI / 2;
    feltMesh.position.y = 0;
    feltMesh.receiveShadow = !this.isSoftwareGl;
    this.tableGroup.add(feltMesh);

    const underPlate = new THREE.Mesh(
      new THREE.BoxGeometry(feltWidth + 0.8, 0.18, feltDepth + 0.8),
      new THREE.MeshStandardMaterial({ color: 0x1c0802, roughness: 0.6 })
    );
    underPlate.position.y = -0.1;
    this.tableGroup.add(underPlate);

    const { map: woodMap, bumpMap: woodBump } = getMahoganyWoodTextures(this.renderer);
    const railMat = new THREE.MeshStandardMaterial({
      map: woodMap,
      bumpMap: woodBump,
      bumpScale: 0.02,
      color: 0xffffff,
      roughness: 0.24,
      metalness: 0.12,
    });

    const railThickness = 0.42;
    const railHeight = 0.22;

    const northRail = new THREE.Mesh(
      new THREE.BoxGeometry(feltWidth + railThickness * 2, railHeight, railThickness),
      railMat
    );
    northRail.position.set(0, railHeight / 2 - 0.02, -(feltDepth / 2 + railThickness / 2));
    this.tableGroup.add(northRail);

    const southRail = northRail.clone();
    southRail.position.set(0, railHeight / 2 - 0.02, feltDepth / 2 + railThickness / 2);
    this.tableGroup.add(southRail);

    const westRail = new THREE.Mesh(
      new THREE.BoxGeometry(railThickness, railHeight, feltDepth),
      railMat
    );
    westRail.position.set(-(feltWidth / 2 + railThickness / 2), railHeight / 2 - 0.02, 0);
    this.tableGroup.add(westRail);

    const eastRail = westRail.clone();
    eastRail.position.set(feltWidth / 2 + railThickness / 2, railHeight / 2 - 0.02, 0);
    this.tableGroup.add(eastRail);

    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd99b26,
      metalness: 0.88,
      roughness: 0.22,
    });

    const trimH = new THREE.Mesh(new THREE.BoxGeometry(feltWidth + 0.06, 0.045, 0.055), brassMat);
    trimH.position.set(0, 0.022, -feltDepth / 2);
    this.tableGroup.add(trimH);

    const trimHSouth = trimH.clone();
    trimHSouth.position.set(0, 0.022, feltDepth / 2);
    this.tableGroup.add(trimHSouth);

    const trimV = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.045, feltDepth + 0.06), brassMat);
    trimV.position.set(-feltWidth / 2, 0.022, 0);
    this.tableGroup.add(trimV);

    const trimVEast = trimV.clone();
    trimVEast.position.set(feltWidth / 2, 0.022, 0);
    this.tableGroup.add(trimVEast);

    const cornerGeo = new THREE.BoxGeometry(0.52, 0.24, 0.52);
    const corners = [
      [-feltWidth / 2 - railThickness / 2, -feltDepth / 2 - railThickness / 2],
      [feltWidth / 2 + railThickness / 2, -feltDepth / 2 - railThickness / 2],
      [-feltWidth / 2 - railThickness / 2, feltDepth / 2 + railThickness / 2],
      [feltWidth / 2 + railThickness / 2, feltDepth / 2 + railThickness / 2],
    ];
    for (const [cx, cz] of corners) {
      const plaque = new THREE.Mesh(cornerGeo, brassMat);
      plaque.position.set(cx, railHeight / 2 - 0.01, cz);
      this.tableGroup.add(plaque);
    }

    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0x1a110b,
      roughness: 0.52,
      metalness: 0.06,
    });
    const bolsterRadius = 0.22;
    const southBolster = new THREE.Mesh(
      new THREE.CylinderGeometry(
        bolsterRadius,
        bolsterRadius,
        feltWidth + railThickness * 2 + 0.2,
        20
      ),
      leatherMat
    );
    southBolster.rotation.z = Math.PI / 2;
    southBolster.scale.set(0.65, 1, 1);
    southBolster.position.set(0, 0.14, feltDepth / 2 + railThickness + 0.12);
    this.tableGroup.add(southBolster);

    const northBolster = southBolster.clone();
    northBolster.position.set(0, 0.14, -(feltDepth / 2 + railThickness + 0.12));
    this.tableGroup.add(northBolster);

    const sideBolsterGeo = new THREE.CylinderGeometry(
      bolsterRadius,
      bolsterRadius,
      feltDepth + railThickness * 2 + 0.2,
      20
    );
    const westBolster = new THREE.Mesh(sideBolsterGeo, leatherMat);
    westBolster.rotation.x = Math.PI / 2;
    westBolster.scale.set(1, 1, 0.65);
    westBolster.position.set(-(feltWidth / 2 + railThickness + 0.12), 0.14, 0);
    this.tableGroup.add(westBolster);

    const eastBolster = westBolster.clone();
    eastBolster.position.set(feltWidth / 2 + railThickness + 0.12, 0.14, 0);
    this.tableGroup.add(eastBolster);

    const columnGeo = new THREE.CylinderGeometry(0.65, 0.95, 3.0, 24);
    for (const px of [-2.2, 2.2]) {
      const col = new THREE.Mesh(columnGeo, railMat);
      col.position.set(px, -1.55, 0);
      this.tableGroup.add(col);

      const footRing = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.07, 14, 28), brassMat);
      footRing.rotation.x = Math.PI / 2;
      footRing.position.set(px, -2.85, 0);
      this.tableGroup.add(footRing);
    }

    this.scene.add(this.tableGroup);
  }

  private buildCardShoesAndPedestal() {
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd49b27,
      roughness: 0.24,
      metalness: 0.86,
    });
    const darkBrassMat = new THREE.MeshStandardMaterial({
      color: 0x855812,
      roughness: 0.42,
      metalness: 0.72,
    });
    const { map: woodMap } = getMahoganyWoodTextures(this.renderer);
    const shoeWoodMat = new THREE.MeshStandardMaterial({
      map: woodMap,
      roughness: 0.28,
      metalness: 0.12,
    });

    const createShoeTray = (x: number, z: number) => {
      const shoeGroup = new THREE.Group();
      shoeGroup.position.set(x, 0, z);

      const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 2.35), this.cardShadowMat);
      sh.rotation.x = -Math.PI / 2;
      sh.position.y = 0.008;
      shoeGroup.add(sh);

      const base = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.07, 1.98), brassMat);
      base.position.y = 0.035;
      shoeGroup.add(base);

      const bed = new THREE.Mesh(
        new THREE.BoxGeometry(1.28, 0.02, 1.76),
        new THREE.MeshStandardMaterial({ color: 0x0a2e19, roughness: 0.9 })
      );
      bed.position.y = 0.075;
      shoeGroup.add(bed);

      const wallGeo = new THREE.BoxGeometry(0.09, 0.26, 1.82);
      const leftWall = new THREE.Mesh(wallGeo, shoeWoodMat);
      leftWall.position.set(-0.68, 0.16, -0.02);
      shoeGroup.add(leftWall);

      const rightWall = new THREE.Mesh(wallGeo, shoeWoodMat);
      rightWall.position.set(0.68, 0.16, -0.02);
      shoeGroup.add(rightWall);

      const backWall = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.3, 0.09), darkBrassMat);
      backWall.position.set(0, 0.18, -0.9);
      shoeGroup.add(backWall);

      const lipLeft = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.06), brassMat);
      lipLeft.position.set(-0.48, 0.11, 0.9);
      shoeGroup.add(lipLeft);

      const lipRight = lipLeft.clone();
      lipRight.position.set(0.48, 0.11, 0.9);
      shoeGroup.add(lipRight);

      return shoeGroup;
    };

    this.tableGroup.add(createShoeTray(DECK1_POS.x, DECK1_POS.z));
    this.tableGroup.add(createShoeTray(DECK2_POS.x, DECK2_POS.z));

    const pedGroup = new THREE.Group();
    pedGroup.position.set(HUKAM_POS.x, 0, HUKAM_POS.z);

    const pedShadow = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 3.1), this.cardShadowMat);
    pedShadow.rotation.x = -Math.PI / 2;
    pedShadow.position.y = 0.008;
    pedGroup.add(pedShadow);

    const obsidianMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.2,
      metalness: 0.35,
    });
    const stepBase = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.44, 0.09, 36), obsidianMat);
    stepBase.position.y = 0.045;
    pedGroup.add(stepBase);

    const brassTier = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.28, 0.09, 36), brassMat);
    brassTier.position.y = 0.13;
    pedGroup.add(brassTier);

    const torusRim = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.045, 16, 40), brassMat);
    torusRim.rotation.x = Math.PI / 2;
    torusRim.position.y = 0.175;
    pedGroup.add(torusRim);

    const velvetMat = new THREE.MeshStandardMaterial({
      color: 0x6b111b,
      roughness: 0.78,
      metalness: 0.04,
    });
    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.14, 0.05, 36), velvetMat);
    cushion.position.y = 0.18;
    pedGroup.add(cushion);

    const cradleFrame = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.02, 1.74), darkBrassMat);
    cradleFrame.position.y = 0.205;
    pedGroup.add(cradleFrame);

    const studGeo = new THREE.SphereGeometry(0.055, 14, 14);
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const stud = new THREE.Mesh(studGeo, brassMat);
      stud.position.set(Math.cos(angle) * 1.18, 0.22, Math.sin(angle) * 1.18);
      pedGroup.add(stud);
    }

    this.tableGroup.add(pedGroup);
  }

  private buildChipStacks() {
    const chipConfigs = [
      { denom: 50, color: '#1d4ed8', x: -3.55, z: 2.15, count: 6 },
      { denom: 100, color: '#b91c1c', x: -2.85, z: 2.38, count: 8 },
      { denom: 1000, color: '#d97706', x: 0, z: 2.45, count: 7 },
      { denom: 250, color: '#15803d', x: 2.85, z: 2.38, count: 7 },
      { denom: 500, color: '#6d28d9', x: 3.55, z: 2.15, count: 5 },
    ];

    const chipGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.058, 28);
    const chipShadowGeo = new THREE.PlaneGeometry(0.82, 0.82);

    chipConfigs.forEach(({ denom, color, x, z, count }) => {
      const chipTex = getChipTexture(denom, color);
      const topBottomMat = new THREE.MeshStandardMaterial({
        map: chipTex,
        color: 0xffffff,
        roughness: 0.28,
        metalness: 0.18,
      });
      const sideMat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.38,
        metalness: 0.12,
      });

      const mats = [sideMat, topBottomMat, topBottomMat];

      const sh = new THREE.Mesh(chipShadowGeo, this.cardShadowMat);
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(x, 0.008, z);
      this.chipsGroup.add(sh);

      for (let i = 0; i < count; i++) {
        const chip = new THREE.Mesh(chipGeo, mats);
        const jitterX = Math.sin(i * 1.7 + denom) * 0.014;
        const jitterZ = Math.cos(i * 2.3 + denom) * 0.014;
        chip.position.set(x + jitterX, 0.032 + i * 0.059, z + jitterZ);
        chip.rotation.y = (i * 0.65) % (Math.PI * 2);
        chip.castShadow = !this.isSoftwareGl;
        this.chipsGroup.add(chip);
      }
    });

    this.tableGroup.add(this.chipsGroup);
  }

  private buildDeckVisuals() {
    this.deck1MeshGroup.position.copy(DECK1_POS);
    this.tableGroup.add(this.deck1MeshGroup);

    this.deck2MeshGroup.position.copy(DECK2_POS);
    this.tableGroup.add(this.deck2MeshGroup);

    this.renderDeckStacks(52, 0);
  }

  public renderDeckStacks(deck1Count: number, deck2Count: number) {
    while (this.deck1MeshGroup.children.length > 0) {
      this.deck1MeshGroup.remove(this.deck1MeshGroup.children[0]);
    }
    while (this.deck2MeshGroup.children.length > 0) {
      this.deck2MeshGroup.remove(this.deck2MeshGroup.children[0]);
    }

    if (deck1Count > 0) {
      const thickness = Math.max(0.035, deck1Count * 0.0085);
      const subGeo = new THREE.BoxGeometry(1.18, thickness, 1.66);

      const materials = [
        this.cardStackEdgeMaterial,
        this.cardStackEdgeMaterial,
        this.cardBackRedMaterial, // +Y Top face shows ornate Crimson Red back
        this.cardPaperEdgeMaterial,
        this.cardStackEdgeMaterial,
        this.cardStackEdgeMaterial,
      ];

      const deck1Mesh = new THREE.Mesh(subGeo, materials);
      deck1Mesh.position.y = thickness / 2;
      deck1Mesh.castShadow = !this.isSoftwareGl;
      deck1Mesh.receiveShadow = !this.isSoftwareGl;
      this.deck1MeshGroup.add(deck1Mesh);

      this.cutBottomHalfMesh = deck1Mesh;
      this.cutTopHalfMesh = null;
    }

    if (deck2Count > 0) {
      const thickness = Math.max(0.035, deck2Count * 0.0085);
      const subGeo = new THREE.BoxGeometry(1.18, thickness, 1.66);

      const materials = [
        this.cardStackEdgeMaterial,
        this.cardStackEdgeMaterial,
        this.cardBackBlueMaterial, // +Y Top face shows ornate Imperial Blue back
        this.cardPaperEdgeMaterial,
        this.cardStackEdgeMaterial,
        this.cardStackEdgeMaterial,
      ];

      const deck2Mesh = new THREE.Mesh(subGeo, materials);
      deck2Mesh.position.y = thickness / 2;
      deck2Mesh.castShadow = !this.isSoftwareGl;
      deck2Mesh.receiveShadow = !this.isSoftwareGl;
      this.deck2MeshGroup.add(deck2Mesh);
    }
  }

  public previewCut(cutIndex: number, totalCards = 52) {
    const ratio = cutIndex / totalCards;
    const liftY = 0.05 + (1 - ratio) * 0.28;
    const shiftX = (1 - ratio) * 0.24;
    const tiltDeg = (1 - ratio) * 0.11;

    const materials = [
      this.cardStackEdgeMaterial,
      this.cardStackEdgeMaterial,
      this.cardBackRedMaterial,
      this.cardPaperEdgeMaterial,
      this.cardStackEdgeMaterial,
      this.cardStackEdgeMaterial,
    ];

    if (!this.cutTopHalfMesh && this.cutBottomHalfMesh) {
      const topCount = totalCards - cutIndex;
      const bottomCount = cutIndex;

      const topThick = Math.max(0.025, topCount * 0.0085);
      const bottomThick = Math.max(0.025, bottomCount * 0.0085);

      const topGeo = new THREE.BoxGeometry(1.18, topThick, 1.66);
      const bottomGeo = new THREE.BoxGeometry(1.18, bottomThick, 1.66);

      this.cutBottomHalfMesh.geometry.dispose();
      this.cutBottomHalfMesh.geometry = bottomGeo;
      this.cutBottomHalfMesh.position.y = bottomThick / 2;

      this.cutTopHalfMesh = new THREE.Mesh(topGeo, materials);
      this.cutTopHalfMesh.position.set(shiftX, bottomThick + liftY, 0);
      this.cutTopHalfMesh.rotation.z = -tiltDeg;
      this.deck1MeshGroup.add(this.cutTopHalfMesh);
    } else if (this.cutTopHalfMesh && this.cutBottomHalfMesh) {
      const topCount = totalCards - cutIndex;
      const bottomCount = cutIndex;
      const topThick = Math.max(0.025, topCount * 0.0085);
      const bottomThick = Math.max(0.025, bottomCount * 0.0085);

      this.cutBottomHalfMesh.geometry.dispose();
      this.cutBottomHalfMesh.geometry = new THREE.BoxGeometry(1.18, bottomThick, 1.66);
      this.cutBottomHalfMesh.position.y = bottomThick / 2;

      this.cutTopHalfMesh.geometry.dispose();
      this.cutTopHalfMesh.geometry = new THREE.BoxGeometry(1.18, topThick, 1.66);
      this.cutTopHalfMesh.position.set(shiftX, bottomThick + liftY, 0);
      this.cutTopHalfMesh.rotation.z = -tiltDeg;
    }
  }

  public async resetRoundAnimation(): Promise<void> {
    this.winningCardHover = null;
    this.dealtCardsPlayer.forEach((g) => this.tableGroup.remove(g));
    this.dealtCardsDealer.forEach((g) => this.tableGroup.remove(g));
    this.dealtCardsPlayer = [];
    this.dealtCardsDealer = [];

    if (this.pointCardMesh) {
      this.tableGroup.remove(this.pointCardMesh);
      this.pointCardMesh = null;
    }

    this.renderDeckStacks(52, 0);
    soundEngine.playShuffleRiffle();

    const shuffleCards: THREE.Mesh[] = [];
    const packetCount = 8;
    const tempGeo = new THREE.BoxGeometry(1.18, 0.02, 1.66);
    const materials = [
      this.cardStackEdgeMaterial,
      this.cardStackEdgeMaterial,
      this.cardBackRedMaterial,
      this.cardPaperEdgeMaterial,
      this.cardStackEdgeMaterial,
      this.cardStackEdgeMaterial,
    ];

    for (let i = 0; i < packetCount; i++) {
      const mesh = new THREE.Mesh(tempGeo, materials);
      const isLeft = i % 2 === 0;
      mesh.position.set(DECK1_POS.x + (isLeft ? -0.75 : 0.75), 0.45 + i * 0.04, DECK1_POS.z);
      mesh.rotation.z = isLeft ? 0.18 : -0.18;
      this.tableGroup.add(mesh);
      shuffleCards.push(mesh);
    }

    await this.runTween(0.42, (_p, ease) => {
      shuffleCards.forEach((c, idx) => {
        const isLeft = idx % 2 === 0;
        const startX = DECK1_POS.x + (isLeft ? -0.75 : 0.75);
        c.position.x = THREE.MathUtils.lerp(startX, DECK1_POS.x, ease);
        c.position.y = THREE.MathUtils.lerp(0.45 + idx * 0.04, DECK1_POS.y + idx * 0.02, ease);
        c.rotation.z = THREE.MathUtils.lerp(isLeft ? 0.18 : -0.18, 0, ease);
      });
    });

    shuffleCards.forEach((c) => this.tableGroup.remove(c));
    tempGeo.dispose();
    this.renderDeckStacks(52, 0);
  }

  public async animateSplitAndReveal(
    cutIndex: number,
    pointCard: Card,
    onSplitLanded?: () => void
  ): Promise<void> {
    const deck1Remain = cutIndex;
    const deck2Total = 52 - cutIndex;

    const cutPacketThick = Math.max(0.035, deck2Total * 0.0085);
    const packetGeo = new THREE.BoxGeometry(1.18, cutPacketThick, 1.66);
    const packetMat = [
      this.cardStackEdgeMaterial,
      this.cardStackEdgeMaterial,
      this.cardBackBlueMaterial,
      this.cardPaperEdgeMaterial,
      this.cardStackEdgeMaterial,
      this.cardStackEdgeMaterial,
    ];

    const flyingPacket = new THREE.Mesh(packetGeo, packetMat);
    flyingPacket.position.set(DECK1_POS.x, 0.42, DECK1_POS.z);
    flyingPacket.castShadow = !this.isSoftwareGl;
    this.tableGroup.add(flyingPacket);

    this.renderDeckStacks(deck1Remain, 0);
    soundEngine.playCardFlick(1.1);

    await this.runTween(0.42, (progress, ease) => {
      const curX = THREE.MathUtils.lerp(DECK1_POS.x, DECK2_POS.x, ease);
      const curY = 0.22 + Math.sin(progress * Math.PI) * 0.72;
      const curRotZ = Math.sin(progress * Math.PI) * 0.22;
      flyingPacket.position.set(curX, curY, DECK1_POS.z);
      flyingPacket.rotation.z = curRotZ;
    });

    this.tableGroup.remove(flyingPacket);
    flyingPacket.geometry.dispose();
    this.renderDeckStacks(deck1Remain, deck2Total - 1);
    if (onSplitLanded) onSplitLanded();

    const cardGroup = this.createCardGroup(pointCard, 'blue');
    cardGroup.position.set(DECK2_POS.x, 0.14, DECK2_POS.z);
    cardGroup.rotation.set(Math.PI, 0, 0);
    this.tableGroup.add(cardGroup);

    soundEngine.playCardFlick(0.95);
    setTimeout(() => soundEngine.playHukamChime(), 220);

    const startPos = new THREE.Vector3(DECK2_POS.x, 0.14, DECK2_POS.z);
    const endPos = new THREE.Vector3(HUKAM_POS.x, 0.23, HUKAM_POS.z);

    await this.runTween(0.56, (progress, ease) => {
      const curX = THREE.MathUtils.lerp(startPos.x, endPos.x, ease);
      const curZ = THREE.MathUtils.lerp(startPos.z, endPos.z, ease);
      const curY =
        THREE.MathUtils.lerp(startPos.y, endPos.y, ease) + Math.sin(progress * Math.PI) * 1.35;
      const curRotX = THREE.MathUtils.lerp(Math.PI, 0, ease);
      const curRotZ = Math.sin(progress * Math.PI) * 0.28;
      cardGroup.position.set(curX, curY, curZ);
      cardGroup.rotation.set(curRotX, 0, curRotZ);
    });

    cardGroup.position.copy(endPos);
    cardGroup.rotation.set(0, 0, 0);
    this.pointCardMesh = cardGroup;
    this.spawnGoldenShockwave(endPos);
  }

  public async animateDealCard(
    card: Card,
    fromShoe: 1 | 2,
    toSide: Side,
    cardCountOnMat: number,
    isWinningCard: boolean
  ): Promise<void> {
    const startX = fromShoe === 1 ? DECK1_POS.x : DECK2_POS.x;
    const startY = 0.24;
    const startZ = DECK1_POS.z;

    const isPlayer = toSide === 'player';
    const matCenter = isPlayer ? PLAYER_MAT_POS : DEALER_MAT_POS;

    const offsetIndex = Math.min(cardCountOnMat - 1, 7);
    const fanX = matCenter.x + (offsetIndex - 3) * 0.16;
    const fanZ = matCenter.z + (offsetIndex - 3) * 0.05;
    const fanRotY = (((cardCountOnMat * 9) % 13) - 6) * (Math.PI / 180);
    const endY = 0.025 + cardCountOnMat * 0.012;

    const cardGroup = this.createCardGroup(card, fromShoe === 1 ? 'red' : 'blue');
    cardGroup.position.set(startX, startY, startZ);
    cardGroup.rotation.set(Math.PI, 0, 0);
    this.tableGroup.add(cardGroup);

    soundEngine.playCardFlick(isPlayer ? 1.05 : 0.95);

    const duration = isWinningCard ? 0.48 : 0.25;
    const peakY = isWinningCard ? 1.65 : 0.88;

    await this.runTween(duration, (progress, ease) => {
      const curX = THREE.MathUtils.lerp(startX, fanX, ease);
      const curZ = THREE.MathUtils.lerp(startZ, fanZ, ease);
      const curY =
        THREE.MathUtils.lerp(startY, endY, ease) + Math.sin(progress * Math.PI) * peakY;
      const curRotX = THREE.MathUtils.lerp(Math.PI, 0, ease);
      const curRotY =
        THREE.MathUtils.lerp(0, fanRotY, ease) +
        Math.sin(progress * Math.PI) * (isPlayer ? -0.18 : 0.18);

      cardGroup.position.set(curX, curY, curZ);
      cardGroup.rotation.set(curRotX, curRotY, 0);
    });

    cardGroup.position.set(fanX, endY, fanZ);
    cardGroup.rotation.set(0, fanRotY, 0);

    if (isPlayer) {
      this.dealtCardsPlayer.push(cardGroup);
    } else {
      this.dealtCardsDealer.push(cardGroup);
    }

    if (isWinningCard) {
      this.animateWinningCardHighlight(cardGroup, toSide);
    }
  }

  private animateWinningCardHighlight(cardGroup: THREE.Group, winnerSide: Side) {
    if (winnerSide === 'player') {
      soundEngine.playWinFanfare();
    } else {
      soundEngine.playLossSting();
    }

    this.spawnVictoryParticles(cardGroup.position, winnerSide === 'player' ? 0xfbbf24 : 0xf43f5e);
    this.spawnGoldenShockwave(cardGroup.position);

    this.winningCardHover = {
      group: cardGroup,
      baseY: cardGroup.position.y,
      time: 0,
    };
  }

  private spawnGoldenShockwave(position: THREE.Vector3) {
    const ringGeo = new THREE.RingGeometry(0.12, 0.24, 36);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(position.x, position.y + 0.02, position.z);
    this.tableGroup.add(ring);

    this.runTween(0.45, (progress) => {
      const scale = 1 + progress * 4.5;
      ring.scale.set(scale, scale, scale);
      ringMat.opacity = Math.max(0, 0.85 * (1 - progress));
    }).then(() => {
      this.tableGroup.remove(ring);
      ringGeo.dispose();
      ringMat.dispose();
    });
  }

  private spawnVictoryParticles(origin: THREE.Vector3, colorHex: number) {
    const particleCount = 32;
    const pGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.03, 12);
    const pMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.22,
      metalness: 0.88,
    });

    for (let i = 0; i < particleCount; i++) {
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.position.copy(origin);
      this.scene.add(pMesh);

      const angle = Math.random() * Math.PI * 2;
      const speed = 1.1 + Math.random() * 2.2;
      const upSpeed = 2.4 + Math.random() * 3.2;

      this.particles.push({
        mesh: pMesh,
        vel: new THREE.Vector3(Math.cos(angle) * speed, upSpeed, Math.sin(angle) * speed),
        rotVel: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9),
        life: 0,
        maxLife: 1.1 + Math.random() * 0.7,
      });
    }
  }

  public setCameraView(view: CameraView) {
    this.currentCameraView = view;
    this.pointerOffset.set(0, 0);
  }

  public getCameraView(): CameraView {
    return this.currentCameraView;
  }

  private onWindowResize = () => {
    if (!this.container || this.destroyed) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private afterDraw = (cb: () => void) => {
    if (this.destroyed) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
    gl.flush?.();
    if (!sync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const poll = () => {
      if (this.destroyed) return;
      const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  };

  private startLoop() {
    const tick = () => {
      if (this.destroyed) return;

      const dt = Math.min(this.clock.getDelta(), 0.05);
      const now = performance.now();

      for (let i = this.tweens.length - 1; i >= 0; i--) {
        const tw = this.tweens[i];
        const progress = Math.min(Math.max((now - tw.startTime) / tw.duration, 0), 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        tw.onUpdate(progress, ease);
        if (progress >= 1) {
          this.tweens.splice(i, 1);
          tw.onComplete();
        }
      }

      if (this.winningCardHover) {
        this.winningCardHover.time += dt * 3;
        this.winningCardHover.group.position.y =
          this.winningCardHover.baseY + 0.25 + Math.sin(this.winningCardHover.time) * 0.05;
      }

      const aspect = this.camera.aspect || 1;
      this.computeAdaptiveCamera(this.currentCameraView, aspect, _targetCamPos, _targetCamLook);

      const dampFactor = this.isSoftwareGl ? 1 : 1 - Math.exp(-6.0 * dt);
      this.camera.position.lerp(_targetCamPos, dampFactor);
      _currentLookAt.lerp(_targetCamLook, dampFactor);
      this.camera.lookAt(_currentLookAt);

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          this.scene.remove(p.mesh);
          p.mesh.geometry.dispose();
          this.particles.splice(i, 1);
        } else {
          p.vel.y -= 9.8 * dt;
          p.mesh.position.addScaledVector(p.vel, dt);
          p.mesh.rotation.x += p.rotVel.x * dt;
          p.mesh.rotation.y += p.rotVel.y * dt;
          const scale = 1 - p.life / p.maxLife;
          p.mesh.scale.set(scale, scale, scale);
        }
      }

      this.renderer.render(this.scene, this.camera);
      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    this.frameId = requestAnimationFrame(tick);
  }

  public dispose() {
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.onWindowResize);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    this.cardGeometry.dispose();
    this.cardShadowGeo.dispose();
    this.cardPaperEdgeMaterial.dispose();
    this.cardStackEdgeMaterial.dispose();
    this.cardBackRedMaterial.dispose();
    this.cardBackBlueMaterial.dispose();

    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
