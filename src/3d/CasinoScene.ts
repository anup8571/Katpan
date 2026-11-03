import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Card, CameraView, Participant, PlayerSlotId, SeatId, SeatInfo, Side } from '../game/types';
import { soundEngine } from '../game/audio';
import {
  getCardFrontTexture,
  getCardBackTexture,
  getCardStackEdgeTexture,
  getCardLinenBumpTexture,
  getTuftedLeatherTextures,
  getFeltTableTexture,
  getMahoganyWoodTextures,
  getSoftShadowTexture,
  getChipTexture,
  getDealerPuckTexture,
  getTablePlaqueTexture,
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

// Middle of Table (z = -0.68 to +0.68): Card System (1st & 2nd Shoes + Andar/Bahar Mats + Hukam Pedestal)
const DECK1_POS = new THREE.Vector3(-2.95, 0.1, 0.0);
const DECK2_POS = new THREE.Vector3(-1.68, 0.1, 0.0);
const DEALER_MAT_POS = new THREE.Vector3(0.18, 0.03, -0.68);
const PLAYER_MAT_POS = new THREE.Vector3(0.18, 0.03, 0.68);
const HUKAM_POS = new THREE.Vector3(2.68, 0.2, 0.0);

const SLOT_POSITIONS: Record<PlayerSlotId, THREE.Vector3> = {
  1: new THREE.Vector3(-2.75, 0.02, 2.35),
  2: new THREE.Vector3(0, 0.02, 2.42),
  3: new THREE.Vector3(2.75, 0.02, 2.35),
};

// 6-Player Symmetric Anti-Clockwise Ring: 3 on North Side (F, A, B) + 3 on South Side (C, D, E)
const SEAT_3D_POSITIONS: Record<SeatId, THREE.Vector3> = {
  A: new THREE.Vector3(0, 0.02, -2.42),
  B: new THREE.Vector3(-2.75, 0.02, -2.35),
  C: new THREE.Vector3(-2.75, 0.02, 2.35),
  D: new THREE.Vector3(0, 0.02, 2.42),
  E: new THREE.Vector3(2.75, 0.02, 2.35),
  F: new THREE.Vector3(2.75, 0.02, -2.35),
};

const SEAT_PUCK_POSITIONS: Record<SeatId, THREE.Vector3> = {
  A: new THREE.Vector3(0.75, 0.01, -2.18),
  B: new THREE.Vector3(-2.0, 0.01, -2.12),
  C: new THREE.Vector3(-2.0, 0.01, 2.02),
  D: new THREE.Vector3(0.75, 0.01, 2.08),
  E: new THREE.Vector3(2.0, 0.01, 2.02),
  F: new THREE.Vector3(2.0, 0.01, -2.12),
};

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
      pos: new THREE.Vector3(0, 8.1, 7.5),
      look: new THREE.Vector3(0, 0.12, -0.65),
    },
    cinematic: {
      pos: new THREE.Vector3(0, 6.8, 9.6),
      look: new THREE.Vector3(0, 0.15, -0.55),
    },
    player: {
      pos: new THREE.Vector3(0, 5.2, 6.2),
      look: new THREE.Vector3(0, -0.1, -0.8),
    },
    pedestal: {
      pos: new THREE.Vector3(1.4, 5.4, 3.8),
      look: new THREE.Vector3(1.1, 0.1, -1.55),
    },
  };

  private pointerOffset = new THREE.Vector2(0, 0);
  private isDragging = false;
  private dragStart = new THREE.Vector2(0, 0);
  private cameraZoom = 1.0;
  private pinchStartDist = 0;
  private pinchStartZoom = 1.0;
  private targetPixelRatio = 2.0;
  private hardwareProfileLabel = 'ULTRA HD';
  private onZoomChangeCallback?: (zoom: number) => void;
  private isRoundOverOrbit = false;
  private roundOverOrbitAngle = 0;

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

  // New 3D Dealer & Multi-Slot Visuals
  private dealerPuckGroup = new THREE.Group();
  private activeSlotHalo!: THREE.Mesh;
  private dealerPlaqueMesh!: THREE.Mesh;
  private slotPlaqueMeshes: Record<PlayerSlotId, THREE.Mesh> = {} as Record<
    PlayerSlotId,
    THREE.Mesh
  >;
  private seatPlaqueMeshes: Partial<Record<SeatId, THREE.Mesh>> = {};
  private croupierGroup = new THREE.Group();
  private slotCharacterGroups: Record<PlayerSlotId, THREE.Group> = {} as Record<
    PlayerSlotId,
    THREE.Group
  >;
  private currentDealerRole: Participant = 'bot';
  private activeSlotId: PlayerSlotId = 2;

  private cutTopHalfMesh: THREE.Mesh | null = null;
  private cutBottomHalfMesh: THREE.Mesh | null = null;

  private cardGeometry!: THREE.BoxGeometry;
  private cardShadowGeo!: THREE.PlaneGeometry;
  private cardShadowMat!: THREE.MeshBasicMaterial;
  private cardLinenBumpTex!: THREE.CanvasTexture;
  private cardPaperEdgeMaterial!: THREE.MeshStandardMaterial;
  private cardStackEdgeMaterial!: THREE.MeshStandardMaterial;
  private cardBackRedMaterial!: THREE.MeshStandardMaterial;
  private cardBackBlueMaterial!: THREE.MeshStandardMaterial;

  constructor(container: HTMLElement) {
    this.container = container;

    // Detect if strictly running in an emulation/software environment (SwiftShader)
    this.isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return false;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const rendererStr = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
        return /SwiftShader|llvmpipe|softpipe/i.test(rendererStr);
      } catch {
        return false;
      }
    })();

    // Always enable hardware antialiasing (MSAA) for razor-sharp edges
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      depth: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    // Automatic CPU + GPU Hardware Capability Profiler
    const cpuCores =
      typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    const deviceMem =
      typeof navigator !== 'undefined'
        ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4
        : 4;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    // Unlock full native Retina/AMOLED pixel density (up to 3.5x) on real hardware
    this.targetPixelRatio = this.isSoftwareGl ? 1 : Math.min(dpr, 3.5);
    this.renderer.setPixelRatio(this.targetPixelRatio);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.hardwareProfileLabel = this.isSoftwareGl
      ? 'SW RENDER'
      : `${this.targetPixelRatio.toFixed(1)}x DPR • ${cpuCores}C • ${maxAniso}x AF`;

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.touchAction = 'none';
    this.container.appendChild(this.renderer.domElement);
    void deviceMem;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#070b12');
    // Clear room fog so table, cards, chips, and text have razor-sharp contrast with 0 milky haze
    this.scene.fog = null;

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
    this.buildDealerStationAndChairs();
    this.buildCardShoesAndPedestal();
    this.buildPlayerSlotsAndPuck();
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

    // Optimized Mobile Framing: Keep the cards, chips, and mats prominent at 100% unzoomed view
    if (aspect < 1.15) {
      const clampedAspect = Math.max(aspect, 0.42);
      if (view === 'felt') {
        const zoomOut = Math.min(1.92, 0.88 / clampedAspect);
        outPos.set(0, 7.15 * zoomOut, 6.25 * zoomOut);
        outLook.set(0, 0.02, -0.12);
      } else if (view === 'cinematic') {
        const zoomOut = Math.min(1.92, 0.88 / clampedAspect);
        outPos.set(0, 6.8 * zoomOut, 7.2 * zoomOut);
        outLook.set(0, 0.1, -0.18);
      } else if (view === 'player') {
        const zoomOut = Math.min(1.24, 0.78 / clampedAspect);
        const slotX = SLOT_POSITIONS[this.activeSlotId].x * 0.32;
        outPos.set(slotX, 4.7 * zoomOut, 4.5 * zoomOut);
        outLook.set(slotX * 0.45, 0.02, -0.35);
      } else if (view === 'pedestal') {
        const zoomOut = Math.min(1.22, 0.76 / clampedAspect);
        outPos.set(0.65, 4.6 * zoomOut, 3.8 * zoomOut);
        outLook.set(0.65, 0.1, -0.95);
      }
    } else if (view === 'player') {
      const slotX = SLOT_POSITIONS[this.activeSlotId].x * 0.45;
      outPos.x = slotX;
      outLook.x = slotX * 0.4;
    }

    outPos.x += this.pointerOffset.x * 0.65;
    outPos.z += this.pointerOffset.y * 0.45;

    // Apply true 3D Camera Zoom (0.42 = Ultra Close-Up on Cards, 1.0 = Default, 1.35 = Wide)
    const offsetFromLook = outPos.clone().sub(outLook).multiplyScalar(this.cameraZoom);
    outPos.copy(outLook).add(offsetFromLook);

    // Smooth 360-degree circular spin around the 3D table after match ends
    if (this.isRoundOverOrbit) {
      const dx = outPos.x - outLook.x;
      const dz = outPos.z - outLook.z;
      const orbitRadius = Math.hypot(dx, dz);
      outPos.x = outLook.x + Math.sin(this.roundOverOrbitAngle) * orbitRadius;
      outPos.z = outLook.z + Math.cos(this.roundOverOrbitAngle) * orbitRadius;
    }
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
      this.pointerOffset.x = THREE.MathUtils.clamp(-dx * 2.2, -1.4, 1.4);
      this.pointerOffset.y = THREE.MathUtils.clamp(-dy * 1.8, -1.2, 1.2);
    };
    const onPointerUp = () => {
      this.isDragging = false;
    };

    // Mouse-wheel 3D zoom (Desktop)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.08 : -0.08;
      this.setCameraZoom(this.cameraZoom + delta);
    };

    // Two-finger Pinch-to-Zoom in 3D space (Mobile Touch)
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        this.isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.pinchStartDist = Math.hypot(dx, dy);
        this.pinchStartZoom = this.cameraZoom;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && this.pinchStartDist > 10) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const scale = this.pinchStartDist / Math.max(dist, 10);
        this.setCameraZoom(this.pinchStartZoom * scale);
      }
    };
    const onTouchEnd = () => {
      this.pinchStartDist = 0;
    };

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('touchstart', onTouchStart, { passive: true });
    dom.addEventListener('touchmove', onTouchMove, { passive: false });
    dom.addEventListener('touchend', onTouchEnd);
  }

  private initCardResources() {
    this.cardGeometry = new THREE.BoxGeometry(1.12, 0.016, 1.58);
    this.cardLinenBumpTex = getCardLinenBumpTexture(this.renderer);

    this.cardShadowGeo = new THREE.PlaneGeometry(1.36, 1.84);
    this.cardShadowMat = new THREE.MeshBasicMaterial({
      map: getSoftShadowTexture(),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });

    // Warm gilded ivory card edge
    this.cardPaperEdgeMaterial = new THREE.MeshStandardMaterial({
      color: 0xefe9d8,
      roughness: 0.42,
      metalness: 0.14,
    });

    const stackTex = getCardStackEdgeTexture(this.renderer);
    this.cardStackEdgeMaterial = new THREE.MeshStandardMaterial({
      map: stackTex,
      bumpMap: stackTex,
      bumpScale: 0.004,
      roughness: 0.52,
      metalness: 0.08,
    });

    const redBackTex = getCardBackTexture('red', this.renderer);
    this.cardBackRedMaterial = new THREE.MeshStandardMaterial({
      map: redBackTex,
      bumpMap: this.cardLinenBumpTex,
      bumpScale: 0.0035,
      color: 0xffffff,
      roughness: 0.22,
      metalness: 0.1,
    });

    const blueBackTex = getCardBackTexture('blue', this.renderer);
    this.cardBackBlueMaterial = new THREE.MeshStandardMaterial({
      map: blueBackTex,
      bumpMap: this.cardLinenBumpTex,
      bumpScale: 0.0035,
      color: 0xffffff,
      roughness: 0.22,
      metalness: 0.1,
    });
  }

  private createCardGroup(frontCard: Card, backType: 'red' | 'blue' = 'red'): THREE.Group {
    const group = new THREE.Group();

    const frontTex = getCardFrontTexture(frontCard, this.renderer);
    // Unlit sRGB card face (toneMapped: false) so overhead spotlights never bleach or blur pips at unzoomed distance
    const frontMat = new THREE.MeshBasicMaterial({
      map: frontTex,
      color: 0xfafaf9,
      toneMapped: false,
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
    this.spotLight = new THREE.SpotLight(0xfff4dc, 2.55);
    this.spotLight.position.set(0, 12.2, 1.2);
    this.spotLight.angle = Math.PI / 3.1;
    this.spotLight.penumbra = 0.65;
    this.spotLight.decay = 1.1;
    this.spotLight.castShadow = !this.isSoftwareGl;
    if (this.spotLight.castShadow) {
      this.spotLight.shadow.mapSize.width = 1024;
      this.spotLight.shadow.mapSize.height = 1024;
      this.spotLight.shadow.camera.near = 4;
      this.spotLight.shadow.camera.far = 20;
      this.spotLight.shadow.bias = -0.0005;
      this.spotLight.shadow.normalBias = 0.02;
    }
    this.scene.add(this.spotLight);

    const keyRimLight = new THREE.DirectionalLight(0xfde68a, 1.35);
    keyRimLight.position.set(5.5, 8.0, -5.5);
    this.scene.add(keyRimLight);

    const hemiLight = new THREE.HemisphereLight(0x334155, 0x052e16, 1.1);
    this.scene.add(hemiLight);

    const pedLight = new THREE.PointLight(0xfbbf24, 0.35, 8);
    pedLight.position.set(HUKAM_POS.x, 2.6, HUKAM_POS.z);
    this.scene.add(pedLight);
  }

  private buildCasinoRoom() {
    const floorGeo = new THREE.PlaneGeometry(46, 46);
    const { map: woodMap } = getMahoganyWoodTextures(this.renderer);
    const floorTex = woodMap.clone();
    floorTex.needsUpdate = true;
    floorTex.repeat.set(10, 10);

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      color: 0x2d140b,
      roughness: 0.55,
      metalness: 0.1,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -3.1;
    floorMesh.receiveShadow = !this.isSoftwareGl;
    this.scene.add(floorMesh);

    // Rich Crimson & Gold Casino Carpet Runner under the table
    const carpetGeo = new THREE.CircleGeometry(7.6, 48);
    const carpetMat = new THREE.MeshStandardMaterial({
      color: 0x3b0a14,
      roughness: 0.88,
      metalness: 0.02,
    });
    const carpet = new THREE.Mesh(carpetGeo, carpetMat);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.y = -3.08;
    this.scene.add(carpet);

    const carpetRing = new THREE.Mesh(
      new THREE.RingGeometry(7.35, 7.55, 48),
      new THREE.MeshStandardMaterial({ color: 0xd99b26, metalness: 0.75, roughness: 0.3 })
    );
    carpetRing.rotation.x = -Math.PI / 2;
    carpetRing.position.y = -3.07;
    this.scene.add(carpetRing);
  }

  private buildRoyalCasinoTable() {
    const feltWidth = 9.6;
    const feltDepth = 7.2;

    const { map: feltMap, bumpMap: feltBump } = getFeltTableTexture(this.renderer);
    const feltGeo = new THREE.PlaneGeometry(feltWidth, feltDepth);
    const feltMat = new THREE.MeshStandardMaterial({
      map: feltMap,
      bumpMap: feltBump,
      bumpScale: 0.012,
      color: 0xffffff,
      roughness: 0.85,
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
      new THREE.BoxGeometry(feltWidth + 0.85, 0.2, feltDepth + 0.85),
      new THREE.MeshStandardMaterial({ color: 0x1c0802, roughness: 0.6 })
    );
    underPlate.position.y = -0.11;
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

    const railThickness = 0.44;
    const railHeight = 0.23;

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

    const cornerGeo = new THREE.BoxGeometry(0.54, 0.25, 0.54);
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

    const { map: bolsterMap, bumpMap: bolsterBump } = getTuftedLeatherTextures(
      '#24120b',
      '#3e2014',
      this.renderer
    );
    const bolsterTexH = bolsterMap.clone();
    bolsterTexH.needsUpdate = true;
    bolsterTexH.repeat.set(8, 1);
    const bolsterBumpH = bolsterBump.clone();
    bolsterBumpH.needsUpdate = true;
    bolsterBumpH.repeat.set(8, 1);

    const leatherMat = new THREE.MeshStandardMaterial({
      map: bolsterTexH,
      bumpMap: bolsterBumpH,
      bumpScale: 0.015,
      color: 0xffffff,
      roughness: 0.42,
      metalness: 0.08,
    });
    const bolsterRadius = 0.24;
    const southBolster = new THREE.Mesh(
      new THREE.CylinderGeometry(
        bolsterRadius,
        bolsterRadius,
        feltWidth + railThickness * 2 + 0.2,
        24
      ),
      leatherMat
    );
    southBolster.rotation.z = Math.PI / 2;
    southBolster.scale.set(0.68, 1, 1);
    southBolster.position.set(0, 0.145, feltDepth / 2 + railThickness + 0.12);
    this.tableGroup.add(southBolster);

    const northBolster = southBolster.clone();
    northBolster.position.set(0, 0.145, -(feltDepth / 2 + railThickness + 0.12));
    this.tableGroup.add(northBolster);

    const sideBolsterGeo = new THREE.CylinderGeometry(
      bolsterRadius,
      bolsterRadius,
      feltDepth + railThickness * 2 + 0.2,
      24
    );
    const westBolster = new THREE.Mesh(sideBolsterGeo, leatherMat);
    westBolster.rotation.x = Math.PI / 2;
    westBolster.scale.set(1, 1, 0.68);
    westBolster.position.set(-(feltWidth / 2 + railThickness + 0.12), 0.145, 0);
    this.tableGroup.add(westBolster);

    const eastBolster = westBolster.clone();
    eastBolster.position.set(feltWidth / 2 + railThickness + 0.12, 0.145, 0);
    this.tableGroup.add(eastBolster);

    // Recessed Brass Cupholders along the Mahogany Rail for each seat
    const cupRimGeo = new THREE.TorusGeometry(0.13, 0.022, 12, 24);
    const cupWellGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.12, 20);
    const cupWellMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.25,
      metalness: 0.6,
    });
    const cupPositions = [
      [-3.55, feltDepth / 2 + railThickness * 0.48],
      [-0.92, feltDepth / 2 + railThickness * 0.48],
      [1.82, feltDepth / 2 + railThickness * 0.48],
      [-1.55, -(feltDepth / 2 + railThickness * 0.48)],
      [1.55, -(feltDepth / 2 + railThickness * 0.48)],
    ];
    for (const [cx, cz] of cupPositions) {
      const well = new THREE.Mesh(cupWellGeo, cupWellMat);
      well.position.set(cx, railHeight - 0.06, cz);
      this.tableGroup.add(well);

      const rim = new THREE.Mesh(cupRimGeo, brassMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(cx, railHeight + 0.005, cz);
      this.tableGroup.add(rim);
    }

    const columnGeo = new THREE.CylinderGeometry(0.68, 0.98, 3.0, 24);
    for (const px of [-2.4, 2.4]) {
      const col = new THREE.Mesh(columnGeo, railMat);
      col.position.set(px, -1.55, 0);
      this.tableGroup.add(col);

      const footRing = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.07, 14, 28), brassMat);
      footRing.rotation.x = Math.PI / 2;
      footRing.position.set(px, -2.85, 0);
      this.tableGroup.add(footRing);
    }

    this.scene.add(this.tableGroup);
  }

  /**
   * Creates a detailed, multi-part Chesterfield diamond-tufted leather executive chair
   * or high-back Royal Dealer Throne with sculpted cushions, brass studs, scroll armrests,
   * and a 5-star swivel pedestal base.
   */
  private createDetailedChair(opts: {
    x: number;
    z: number;
    rotY: number;
    leatherMat: THREE.MeshStandardMaterial;
    woodMat: THREE.MeshStandardMaterial;
    brassMat: THREE.MeshStandardMaterial;
    isThrone?: boolean;
  }): THREE.Group {
    const { x, z, rotY, leatherMat, woodMat, brassMat, isThrone = false } = opts;
    const chair = new THREE.Group();
    chair.position.set(x, -0.36, z);
    chair.rotation.y = rotY;

    const width = isThrone ? 1.62 : 1.38;
    const backHeight = isThrone ? 1.72 : 1.24;

    // 1. Mahogany under-seat base frame with brass trim molding
    const baseFrame = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.06, 0.12, 1.18),
      woodMat
    );
    baseFrame.position.set(0, -0.1, 0);
    chair.add(baseFrame);

    const frontBrassStrip = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.08, 0.035, 1.2),
      brassMat
    );
    frontBrassStrip.position.set(0, -0.15, 0);
    chair.add(frontBrassStrip);

    // 2. Plump contoured double-layer seat cushion + front waterfall knee roll
    const seatCushion = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.22, 1.12),
      leatherMat
    );
    seatCushion.position.set(0, 0.04, 0);
    seatCushion.castShadow = !this.isSoftwareGl;
    chair.add(seatCushion);

    const kneeRoll = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, width, 16),
      leatherMat
    );
    kneeRoll.rotation.z = Math.PI / 2;
    kneeRoll.position.set(0, 0.04, -0.54);
    chair.add(kneeRoll);

    // 3. Sculpted lumbar bolster pillow
    const lumbarPillow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, width - 0.14, 16),
      leatherMat
    );
    lumbarPillow.rotation.z = Math.PI / 2;
    lumbarPillow.scale.set(0.85, 1, 1.15);
    lumbarPillow.position.set(0, 0.24, 0.36);
    chair.add(lumbarPillow);

    // 4. Tall Chesterfield diamond-tufted backrest + carved mahogany outer shell
    const backGroup = new THREE.Group();
    backGroup.position.set(0, 0.12, 0.48);
    backGroup.rotation.x = isThrone ? 0.08 : 0.14;

    const woodShell = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.1, backHeight + 0.08, 0.14),
      woodMat
    );
    woodShell.position.set(0, backHeight / 2, 0.08);
    backGroup.add(woodShell);

    const paddedBack = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.02, backHeight, 0.22),
      leatherMat
    );
    paddedBack.position.set(0, backHeight / 2, -0.02);
    paddedBack.castShadow = !this.isSoftwareGl;
    backGroup.add(paddedBack);

    // Rounded arched crest cushion at top of backrest
    const topArch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, width - 0.02, 18),
      leatherMat
    );
    topArch.rotation.z = Math.PI / 2;
    topArch.scale.set(1.3, 1, 0.8);
    topArch.position.set(0, backHeight + 0.02, -0.01);
    backGroup.add(topArch);

    // Wingback side bolsters
    const wingGeo = new THREE.CylinderGeometry(0.11, 0.13, backHeight, 14);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(wingGeo, leatherMat);
      wing.position.set(side * (width / 2 - 0.04), backHeight / 2, -0.1);
      wing.rotation.y = side * 0.25;
      backGroup.add(wing);
    }

    // 3D Brass tufting buttons inset across the backrest diamond grid
    const studGeo = new THREE.SphereGeometry(0.028, 10, 10);
    const rows = isThrone ? 4 : 3;
    const cols = 3;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const bx = (c - 1) * (width * 0.26);
        const by = 0.32 + r * 0.32;
        const button = new THREE.Mesh(studGeo, brassMat);
        button.position.set(bx, by, -0.135);
        backGroup.add(button);
      }
    }

    // Brass crest rail & imperial finials on top of backrest
    const crestBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.042, width + 0.14, 14),
      brassMat
    );
    crestBar.rotation.z = Math.PI / 2;
    crestBar.position.set(0, backHeight + 0.12, 0.06);
    backGroup.add(crestBar);

    const finialGeo = new THREE.SphereGeometry(isThrone ? 0.095 : 0.068, 14, 14);
    for (const side of [-1, 1]) {
      const finial = new THREE.Mesh(finialGeo, brassMat);
      finial.position.set(side * (width / 2 + 0.04), backHeight + (isThrone ? 0.2 : 0.15), 0.06);
      backGroup.add(finial);
    }

    chair.add(backGroup);

    // 5. Rolled padded leather armrests on cast-brass scroll brackets
    const armPadGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.96, 16);
    const armSupportGeo = new THREE.CylinderGeometry(0.038, 0.048, 0.36, 12);
    for (const side of [-1, 1]) {
      const ax = side * (width / 2 + 0.05);
      const armPad = new THREE.Mesh(armPadGeo, leatherMat);
      armPad.rotation.x = Math.PI / 2;
      armPad.scale.set(1.15, 1, 0.85);
      armPad.position.set(ax, 0.42, 0.04);
      chair.add(armPad);

      const capFront = new THREE.Mesh(new THREE.SphereGeometry(0.092, 12, 12), brassMat);
      capFront.scale.set(1, 0.8, 0.5);
      capFront.position.set(ax, 0.42, -0.44);
      chair.add(capFront);

      const postFront = new THREE.Mesh(armSupportGeo, brassMat);
      postFront.position.set(ax, 0.2, -0.32);
      postFront.rotation.x = -0.15;
      chair.add(postFront);

      const postBack = new THREE.Mesh(armSupportGeo, brassMat);
      postBack.position.set(ax, 0.2, 0.32);
      postBack.rotation.x = 0.15;
      chair.add(postBack);
    }

    // 6. Swivel pneumatic pedestal & 5-star cast-brass base legs
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.22, 1.95, 16),
      brassMat
    );
    column.position.set(0, -1.12, 0);
    chair.add(column);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 12, 24), brassMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, -1.95, 0);
    chair.add(collar);

    const legGeo = new THREE.BoxGeometry(0.1, 0.08, 0.72);
    for (let i = 0; i < 5; i++) {
      const ang = (i * Math.PI * 2) / 5;
      const leg = new THREE.Mesh(legGeo, brassMat);
      leg.position.set(Math.sin(ang) * 0.34, -2.06, Math.cos(ang) * 0.34);
      leg.rotation.y = ang;
      leg.rotation.x = 0.16;
      chair.add(leg);
    }

    return chair;
  }

  /**
   * Builds an articulated, realistic 3D human character bust & upper body with
   * sculpted facial features, eyes, nose, ears, royal headwear/hair, tailored jacket
   * with lapels & brass buttons, and articulated arms/hands resting near the table rail.
   */
  private createDetailedCharacter(opts: {
    jacketColor: number;
    vestColor: number;
    skinColor: number;
    headwear: 'royal_turban' | 'styled_hair' | 'crown_bun';
    turbanColor?: number;
    hasMustache?: boolean;
  }): THREE.Group {
    const {
      jacketColor,
      vestColor,
      skinColor,
      headwear,
      turbanColor = 0x881337,
      hasMustache = false,
    } = opts;

    const charGroup = new THREE.Group();

    const skinMat = new THREE.MeshStandardMaterial({
      color: skinColor,
      roughness: 0.42,
      metalness: 0.04,
    });
    const jacketMat = new THREE.MeshStandardMaterial({
      color: jacketColor,
      roughness: 0.52,
      metalness: 0.12,
    });
    const lapelMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.25,
      metalness: 0.3,
    });
    const vestMat = new THREE.MeshStandardMaterial({
      color: vestColor,
      roughness: 0.32,
      metalness: 0.45,
    });
    const shirtMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.4,
      metalness: 0.02,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.22,
      metalness: 0.88,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x1c1917,
      roughness: 0.65,
      metalness: 0.05,
    });

    // 1. Torso & Tailored Dinner Jacket / Sherwani
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.41, 0.36, 1.18, 24),
      jacketMat
    );
    torso.scale.set(1.18, 1, 0.76);
    torso.position.set(0, 0.48, 0);
    torso.castShadow = !this.isSoftwareGl;
    charGroup.add(torso);

    // Brocade Waistcoat / Vest front panel
    const vestPanel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.39, 0.35, 1.08, 20, 1, false, -0.55, 1.1),
      vestMat
    );
    vestPanel.scale.set(1.18, 1, 0.79);
    vestPanel.position.set(0, 0.49, 0.01);
    charGroup.add(vestPanel);

    // Crisp White Wing-Collar Dress Shirt Plastron
    const shirtFront = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.44, 0.06), shirtMat);
    shirtFront.position.set(0, 0.82, 0.28);
    charGroup.add(shirtFront);

    // Satin Tuxedo Lapels (Left & Right)
    const lapelGeo = new THREE.BoxGeometry(0.1, 0.52, 0.045);
    for (const side of [-1, 1]) {
      const lapel = new THREE.Mesh(lapelGeo, lapelMat);
      lapel.position.set(side * 0.135, 0.78, 0.305);
      lapel.rotation.z = side * 0.22;
      charGroup.add(lapel);
    }

    // Silk Bow-Tie & Gold Brooch Studs
    const bowCenter = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 10), vestMat);
    bowCenter.position.set(0, 0.99, 0.32);
    charGroup.add(bowCenter);

    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.044, 0.09, 10), vestMat);
      wing.rotation.z = side * (Math.PI / 2);
      wing.scale.set(1, 1, 0.45);
      wing.position.set(side * 0.045, 0.99, 0.32);
      charGroup.add(wing);
    }

    // 3 Brass Jacket Buttons & Gold Pocket Square
    const btnGeo = new THREE.SphereGeometry(0.022, 10, 10);
    for (let b = 0; b < 3; b++) {
      const btn = new THREE.Mesh(btnGeo, brassMat);
      btn.position.set(0, 0.34 + b * 0.14, 0.315);
      charGroup.add(btn);
    }

    const pocketSquare = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.075, 3), brassMat);
    pocketSquare.position.set(-0.24, 0.78, 0.295);
    pocketSquare.rotation.z = -0.15;
    charGroup.add(pocketSquare);

    // 2. Hierarchical Articulated Shoulders, Upper Arms, Elbows, Forearms, Cuffs & Hands
    const shoulderGeo = new THREE.SphereGeometry(0.175, 16, 16);
    const upperArmGeo = new THREE.CylinderGeometry(0.135, 0.115, 0.54, 14);
    const elbowGeo = new THREE.SphereGeometry(0.118, 14, 14);
    const forearmGeo = new THREE.CylinderGeometry(0.112, 0.092, 0.5, 14);
    const cuffGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.08, 14);
    const palmGeo = new THREE.SphereGeometry(0.088, 14, 14);
    const fingerGeo = new THREE.CylinderGeometry(0.017, 0.014, 0.1, 8);

    for (const side of [-1, 1]) {
      const shoulderPivot = new THREE.Group();
      shoulderPivot.position.set(side * 0.49, 0.88, 0.02);
      shoulderPivot.rotation.x = -0.38;
      shoulderPivot.rotation.z = side * -0.14;

      const shoulder = new THREE.Mesh(shoulderGeo, jacketMat);
      shoulderPivot.add(shoulder);

      const upperArm = new THREE.Mesh(upperArmGeo, jacketMat);
      upperArm.position.set(0, -0.27, 0);
      upperArm.castShadow = !this.isSoftwareGl;
      shoulderPivot.add(upperArm);

      const elbowPivot = new THREE.Group();
      elbowPivot.position.set(0, -0.54, 0);
      elbowPivot.rotation.x = -0.95;
      elbowPivot.rotation.z = side * 0.34;

      const elbow = new THREE.Mesh(elbowGeo, jacketMat);
      elbowPivot.add(elbow);

      const forearm = new THREE.Mesh(forearmGeo, jacketMat);
      forearm.position.set(0, -0.25, 0);
      forearm.castShadow = !this.isSoftwareGl;
      elbowPivot.add(forearm);

      const cuff = new THREE.Mesh(cuffGeo, shirtMat);
      cuff.position.set(0, -0.5, 0);
      elbowPivot.add(cuff);

      const handGroup = new THREE.Group();
      handGroup.position.set(0, -0.58, 0);
      handGroup.rotation.x = Math.PI / 2;

      const palm = new THREE.Mesh(palmGeo, skinMat);
      palm.scale.set(0.95, 0.45, 1.18);
      handGroup.add(palm);

      for (let f = 0; f < 4; f++) {
        const finger = new THREE.Mesh(fingerGeo, skinMat);
        finger.rotation.x = Math.PI / 2 + 0.22;
        finger.position.set((f - 1.5) * 0.034, -0.012, 0.11);
        handGroup.add(finger);
      }

      const thumb = new THREE.Mesh(fingerGeo, skinMat);
      thumb.rotation.x = Math.PI / 2 + 0.12;
      thumb.rotation.y = side * -0.52;
      thumb.position.set(side * -0.08, -0.01, 0.04);
      handGroup.add(thumb);

      elbowPivot.add(handGroup);
      shoulderPivot.add(elbowPivot);
      charGroup.add(shoulderPivot);
    }

    // 3. Neck, Sculpted Head, Facial Features & Royal Headwear
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.165, 0.28, 16), skinMat);
    neck.position.set(0, 1.12, 0.04);
    charGroup.add(neck);

    const collarRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.175, 0.19, 0.12, 18),
      shirtMat
    );
    collarRing.position.set(0, 1.05, 0.04);
    charGroup.add(collarRing);

    const headGroup = new THREE.Group();
    headGroup.name = 'characterHead';
    headGroup.position.set(0, 1.44, 0.06);

    // Cranium & sculpted jawline
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.285, 24, 24), skinMat);
    cranium.scale.set(0.94, 1.08, 0.98);
    cranium.castShadow = !this.isSoftwareGl;
    headGroup.add(cranium);

    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 18), skinMat);
    jaw.scale.set(0.92, 0.85, 0.95);
    jaw.position.set(0, -0.1, 0.05);
    headGroup.add(jaw);

    // 3D Ears
    const earGeo = new THREE.SphereGeometry(0.065, 12, 12);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, skinMat);
      ear.scale.set(0.45, 1.15, 0.75);
      ear.position.set(side * 0.265, -0.02, 0.0);
      headGroup.add(ear);
    }

    // 3D Nose bridge & tip
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 12), skinMat);
    nose.position.set(0, -0.01, 0.285);
    nose.rotation.x = 0.28;
    headGroup.add(nose);

    // Detailed Eyes (Sclera + Dark Iris + Specular Highlight) & Eyebrows
    const scleraGeo = new THREE.SphereGeometry(0.042, 12, 12);
    const irisGeo = new THREE.SphereGeometry(0.024, 10, 10);
    const glintGeo = new THREE.SphereGeometry(0.009, 8, 8);
    const browGeo = new THREE.BoxGeometry(0.095, 0.022, 0.03);
    const irisMat = new THREE.MeshBasicMaterial({ color: 0x111827 });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    for (const side of [-1, 1]) {
      const ex = side * 0.098;
      const sclera = new THREE.Mesh(scleraGeo, shirtMat);
      sclera.scale.set(1.15, 0.85, 0.65);
      sclera.position.set(ex, 0.045, 0.255);
      headGroup.add(sclera);

      const iris = new THREE.Mesh(irisGeo, irisMat);
      iris.scale.set(1, 1, 0.5);
      iris.position.set(ex, 0.045, 0.278);
      headGroup.add(iris);

      const glint = new THREE.Mesh(glintGeo, glintMat);
      glint.position.set(ex + 0.008, 0.052, 0.288);
      headGroup.add(glint);

      const brow = new THREE.Mesh(browGeo, hairMat);
      brow.position.set(ex, 0.1, 0.265);
      brow.rotation.z = side * -0.08;
      headGroup.add(brow);
    }

    // Mustache / Groomed Beard or Lips
    if (hasMustache) {
      for (const side of [-1, 1]) {
        const stache = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.11, 10), hairMat);
        stache.rotation.z = side * (Math.PI / 2 + 0.22);
        stache.position.set(side * 0.048, -0.095, 0.275);
        headGroup.add(stache);
      }
      const chinBeard = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 14), hairMat);
      chinBeard.scale.set(1.15, 0.85, 0.9);
      chinBeard.position.set(0, -0.17, 0.145);
      headGroup.add(chinBeard);
    } else {
      const lips = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.08, 10),
        new THREE.MeshStandardMaterial({ color: 0x9f1239, roughness: 0.4 })
      );
      lips.rotation.z = Math.PI / 2;
      lips.scale.set(0.5, 1, 0.5);
      lips.position.set(0, -0.11, 0.268);
      headGroup.add(lips);
    }

    // Headwear: Royal Maharaja Pagri (Turban) or Styled Hair
    if (headwear === 'royal_turban') {
      const turbanMat = new THREE.MeshStandardMaterial({
        color: turbanColor,
        roughness: 0.45,
        metalness: 0.15,
      });

      const baseWrap = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.095, 16, 28), turbanMat);
      baseWrap.rotation.x = Math.PI / 2 - 0.16;
      baseWrap.scale.set(1.02, 1.08, 1.15);
      baseWrap.position.set(0, 0.17, -0.01);
      headGroup.add(baseWrap);

      const upperCrown = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 20), turbanMat);
      upperCrown.scale.set(1.04, 0.85, 1.06);
      upperCrown.position.set(0, 0.22, -0.02);
      headGroup.add(upperCrown);

      // Gold zari band across turban
      const goldBand = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.025, 12, 28), brassMat);
      goldBand.rotation.x = Math.PI / 2 - 0.22;
      goldBand.position.set(0, 0.15, 0.01);
      headGroup.add(goldBand);

      // Faceted Ruby & Gold Kalgi Brooch + Royal Plume on forehead of turban
      const kalgiSetting = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 1), brassMat);
      kalgiSetting.scale.set(1, 1.3, 0.5);
      kalgiSetting.position.set(0, 0.24, 0.26);
      headGroup.add(kalgiSetting);

      const rubyGem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.038, 0),
        new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.1, metalness: 0.4 })
      );
      rubyGem.position.set(0, 0.24, 0.285);
      headGroup.add(rubyGem);

      const plume = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 10), brassMat);
      plume.position.set(0.03, 0.38, 0.24);
      plume.rotation.z = -0.22;
      headGroup.add(plume);
    } else {
      // Sculpted volumetric hair cap + side waves
      const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.295, 20, 20), hairMat);
      hairCap.scale.set(0.98, 1.02, 1.02);
      hairCap.position.set(0, 0.05, -0.03);
      headGroup.add(hairCap);

      const pompadour = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), hairMat);
      pompadour.scale.set(1.25, 0.65, 0.9);
      pompadour.position.set(0, 0.24, 0.12);
      headGroup.add(pompadour);

      if (headwear === 'crown_bun') {
        const tiara = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 12, 24), brassMat);
        tiara.rotation.x = Math.PI / 2 - 0.35;
        tiara.position.set(0, 0.22, 0.05);
        headGroup.add(tiara);
      }
    }

    charGroup.add(headGroup);
    return charGroup;
  }

  /**
   * Builds the 3D North Dealer Station (Banker Chip Rack + Articulated 3D Croupier Figure +
   * Chesterfield Dealer Throne) and the 3 South Player Chesterfield Lounge Chairs + Bot Figures.
   */
  private buildDealerStationAndChairs() {
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd99b26,
      metalness: 0.86,
      roughness: 0.24,
    });
    const obsidianMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.35,
      metalness: 0.25,
    });
    const { map: woodMap, bumpMap: woodBump } = getMahoganyWoodTextures(this.renderer);
    const chairWoodMat = new THREE.MeshStandardMaterial({
      map: woodMap,
      bumpMap: woodBump,
      bumpScale: 0.015,
      roughness: 0.28,
      metalness: 0.1,
    });

    const { map: crimMap, bumpMap: crimBump } = getTuftedLeatherTextures(
      '#5c0f1d',
      '#881337',
      this.renderer
    );
    const crimsonLeatherMat = new THREE.MeshStandardMaterial({
      map: crimMap,
      bumpMap: crimBump,
      bumpScale: 0.022,
      roughness: 0.42,
      metalness: 0.08,
    });

    const { map: emMap, bumpMap: emBump } = getTuftedLeatherTextures(
      '#083822',
      '#0f5c38',
      this.renderer
    );
    const emeraldLeatherMat = new THREE.MeshStandardMaterial({
      map: emMap,
      bumpMap: emBump,
      bumpScale: 0.022,
      roughness: 0.42,
      metalness: 0.08,
    });

    // Build 3 North Players (Seats B, A, F) + 3 South Players (Seats C, D, E)
    // Remove static chip tray so only active betting chips appear on the table!
    void obsidianMat;

    const allSeatConfigs: Array<{
      seatId: SeatId;
      x: number;
      z: number;
      rotY: number;
      isNorth: boolean;
      isCenter: boolean;
      jacketColor: number;
      vestColor: number;
      skinColor: number;
      headwear: 'royal_turban' | 'styled_hair' | 'crown_bun';
      turbanColor?: number;
      hasMustache?: boolean;
    }> = [
      // North Side: 3 Seats (B = North-West, A = North-Center, F = North-East)
      {
        seatId: 'B',
        x: -2.75,
        z: -4.62,
        rotY: Math.PI - 0.16,
        isNorth: true,
        isCenter: false,
        jacketColor: 0x064e3b,
        vestColor: 0xf59e0b,
        skinColor: 0xd6a17c,
        headwear: 'royal_turban',
        turbanColor: 0x1e3a8a,
        hasMustache: true,
      },
      {
        seatId: 'A',
        x: 0,
        z: -4.78,
        rotY: Math.PI,
        isNorth: true,
        isCenter: true,
        jacketColor: 0x0f172a,
        vestColor: 0xb45309,
        skinColor: 0xdba885,
        headwear: 'royal_turban',
        turbanColor: 0x881337,
        hasMustache: true,
      },
      {
        seatId: 'F',
        x: 2.75,
        z: -4.62,
        rotY: Math.PI + 0.16,
        isNorth: true,
        isCenter: false,
        jacketColor: 0x312e81,
        vestColor: 0xd97706,
        skinColor: 0xe5b899,
        headwear: 'styled_hair',
        hasMustache: true,
      },
      // South Side: 3 Seats (C = South-West, D = South-Center, E = South-East)
      {
        seatId: 'C',
        x: -2.75,
        z: 4.65,
        rotY: 0.16,
        isNorth: false,
        isCenter: false,
        jacketColor: 0x1e3a8a,
        vestColor: 0xd97706,
        skinColor: 0xd6a17c,
        headwear: 'styled_hair',
        hasMustache: true,
      },
      {
        seatId: 'D',
        x: 0,
        z: 4.82,
        rotY: 0,
        isNorth: false,
        isCenter: true,
        jacketColor: 0x4c1d95,
        vestColor: 0xf59e0b,
        skinColor: 0xdba885,
        headwear: 'royal_turban',
        turbanColor: 0x065f46,
        hasMustache: true,
      },
      {
        seatId: 'E',
        x: 2.75,
        z: 4.65,
        rotY: -0.16,
        isNorth: false,
        isCenter: false,
        jacketColor: 0x7f1d1d,
        vestColor: 0xfbbf24,
        skinColor: 0xe5b899,
        headwear: 'crown_bun',
        hasMustache: false,
      },
    ];

    for (const cfg of allSeatConfigs) {
      const chair = this.createDetailedChair({
        x: cfg.x,
        z: cfg.z,
        rotY: cfg.rotY,
        leatherMat: cfg.isCenter ? crimsonLeatherMat : emeraldLeatherMat,
        woodMat: chairWoodMat,
        brassMat,
        isThrone: cfg.seatId === 'A',
      });
      this.tableGroup.add(chair);

      const charFigure = this.createDetailedCharacter({
        jacketColor: cfg.jacketColor,
        vestColor: cfg.vestColor,
        skinColor: cfg.skinColor,
        headwear: cfg.headwear,
        turbanColor: cfg.turbanColor,
        hasMustache: cfg.hasMustache,
      });

      if (cfg.isNorth) {
        charFigure.position.set(cfg.x * 0.96, -0.14, cfg.z + 0.3);
        charFigure.rotation.y = cfg.rotY - Math.PI;
      } else {
        charFigure.position.set(cfg.x * 0.96, -0.16, cfg.z - 0.25);
        charFigure.rotation.y = Math.PI + cfg.rotY;
      }

      this.tableGroup.add(charFigure);
      if (cfg.seatId === 'A') {
        this.croupierGroup = charFigure;
      } else if (cfg.seatId === 'C') {
        this.slotCharacterGroups[1] = charFigure;
      } else if (cfg.seatId === 'D') {
        charFigure.visible = false; // Human seat by default
        this.slotCharacterGroups[2] = charFigure;
      } else if (cfg.seatId === 'E') {
        this.slotCharacterGroups[3] = charFigure;
      }
    }
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
    const { map: woodMap, bumpMap: woodBump } = getMahoganyWoodTextures(this.renderer);
    const shoeWoodMat = new THREE.MeshStandardMaterial({
      map: woodMap,
      bumpMap: woodBump,
      bumpScale: 0.015,
      roughness: 0.26,
      metalness: 0.14,
    });
    const glassGuardMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      transparent: true,
      opacity: 0.22,
      roughness: 0.1,
      metalness: 0.3,
    });

    const createShoeTray = (x: number, z: number) => {
      const shoeGroup = new THREE.Group();
      shoeGroup.position.set(x, 0, z);

      const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 2.15), this.cardShadowMat);
      sh.rotation.x = -Math.PI / 2;
      sh.position.y = 0.008;
      shoeGroup.add(sh);

      const base = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.07, 1.88), brassMat);
      base.position.y = 0.035;
      shoeGroup.add(base);

      const bed = new THREE.Mesh(
        new THREE.BoxGeometry(1.22, 0.022, 1.68),
        new THREE.MeshStandardMaterial({ color: 0x072916, roughness: 0.9 })
      );
      bed.position.y = 0.074;
      shoeGroup.add(bed);

      const wallGeo = new THREE.BoxGeometry(0.09, 0.28, 1.74);
      const leftWall = new THREE.Mesh(wallGeo, shoeWoodMat);
      leftWall.position.set(-0.64, 0.16, -0.02);
      shoeGroup.add(leftWall);

      const rightWall = new THREE.Mesh(wallGeo, shoeWoodMat);
      rightWall.position.set(0.64, 0.16, -0.02);
      shoeGroup.add(rightWall);

      // Top brass rail trim along shoe walls
      const railGeo = new THREE.BoxGeometry(0.095, 0.025, 1.74);
      const leftRail = new THREE.Mesh(railGeo, brassMat);
      leftRail.position.set(-0.64, 0.31, -0.02);
      shoeGroup.add(leftRail);

      const rightRail = leftRail.clone();
      rightRail.position.set(0.64, 0.31, -0.02);
      shoeGroup.add(rightRail);

      const backWall = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.32, 0.09), darkBrassMat);
      backWall.position.set(0, 0.18, -0.85);
      shoeGroup.add(backWall);

      // Weighted Brass Card-Presser Roller inside back of shoe
      const roller = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 1.16, 16),
        brassMat
      );
      roller.rotation.z = Math.PI / 2;
      roller.position.set(0, 0.24, -0.68);
      shoeGroup.add(roller);

      // Bevelled front draw slot lips
      const lipLeft = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.07), brassMat);
      lipLeft.position.set(-0.44, 0.12, 0.85);
      shoeGroup.add(lipLeft);

      const lipRight = lipLeft.clone();
      lipRight.position.set(0.44, 0.12, 0.85);
      shoeGroup.add(lipRight);

      // Translucent acrylic top guide plate over rear of shoe
      const topGuard = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.015, 0.55), glassGuardMat);
      topGuard.position.set(0, 0.315, -0.55);
      shoeGroup.add(topGuard);

      return shoeGroup;
    };

    this.tableGroup.add(createShoeTray(DECK1_POS.x, DECK1_POS.z));
    this.tableGroup.add(createShoeTray(DECK2_POS.x, DECK2_POS.z));

    const pedGroup = new THREE.Group();
    pedGroup.position.set(HUKAM_POS.x, 0, HUKAM_POS.z);

    const pedShadow = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.7), this.cardShadowMat);
    pedShadow.rotation.x = -Math.PI / 2;
    pedShadow.position.y = 0.008;
    pedGroup.add(pedShadow);

    const obsidianMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.2,
      metalness: 0.35,
    });
    const stepBase = new THREE.Mesh(new THREE.CylinderGeometry(1.14, 1.24, 0.08, 36), obsidianMat);
    stepBase.position.y = 0.04;
    pedGroup.add(stepBase);

    const brassTier = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.1, 0.08, 36), brassMat);
    brassTier.position.y = 0.12;
    pedGroup.add(brassTier);

    const torusRim = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.04, 16, 40), brassMat);
    torusRim.rotation.x = Math.PI / 2;
    torusRim.position.y = 0.165;
    pedGroup.add(torusRim);

    const velvetMat = new THREE.MeshStandardMaterial({
      color: 0x6b111b,
      roughness: 0.78,
      metalness: 0.04,
    });
    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.96, 0.98, 0.045, 36), velvetMat);
    cushion.position.y = 0.17;
    pedGroup.add(cushion);

    const cradleFrame = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.02, 1.64), darkBrassMat);
    cradleFrame.position.y = 0.195;
    pedGroup.add(cradleFrame);

    const studGeo = new THREE.SphereGeometry(0.048, 12, 12);
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const stud = new THREE.Mesh(studGeo, brassMat);
      stud.position.set(Math.cos(angle) * 1.02, 0.21, Math.sin(angle) * 1.02);
      pedGroup.add(stud);
    }

    this.tableGroup.add(pedGroup);
  }

  /**
   * Builds the 6 Player Betting Rings (3 on North Side: B, A, F; 3 on South Side: C, D, E),
   * 6 Seat Plaques, Glowing Cutter Halo, and 3D Golden Dealer Crown Puck.
   */
  private buildPlayerSlotsAndPuck() {
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.85,
      roughness: 0.22,
    });

    const seatMeta: Array<{ id: SeatId; isNorth: boolean; label: string }> = [
      { id: 'B', isNorth: true, label: 'SEAT B • KABIR' },
      { id: 'A', isNorth: true, label: 'SEAT A • NAWAB' },
      { id: 'F', isNorth: true, label: 'SEAT F • REHAN' },
      { id: 'C', isNorth: false, label: 'SEAT C • ARYAN' },
      { id: 'D', isNorth: false, label: 'SEAT D • YOU' },
      { id: 'E', isNorth: false, label: 'SEAT E • ZOYA' },
    ];

    const plaqueGeo = new THREE.PlaneGeometry(1.62, 0.44);

    for (const meta of seatMeta) {
      const pos = SEAT_3D_POSITIONS[meta.id];

      // 3D Raised Brass Betting Circle on each of the 6 seats
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.028, 14, 36), brassMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(pos.x, 0.025, pos.z);
      this.tableGroup.add(ring);

      const plaqueMat = new THREE.MeshBasicMaterial({
        map: getTablePlaqueTexture(
          meta.label,
          '1000 RC',
          meta.id === 'D' ? '#34d399' : '#fbbf24',
          meta.id === 'D' ? '#064e3b' : '#090d16',
          this.renderer
        ),
        transparent: true,
      });

      const plaqueMesh = new THREE.Mesh(plaqueGeo, plaqueMat);
      plaqueMesh.position.set(
        pos.x,
        0.24,
        meta.isNorth ? pos.z - 0.92 : pos.z + 0.92
      );
      plaqueMesh.rotation.x = meta.isNorth ? -0.52 : -0.58;
      this.tableGroup.add(plaqueMesh);
      this.seatPlaqueMeshes[meta.id] = plaqueMesh;

      if (meta.id === 'A') this.dealerPlaqueMesh = plaqueMesh;
      if (meta.id === 'C') this.slotPlaqueMeshes[1] = plaqueMesh;
      if (meta.id === 'D') this.slotPlaqueMeshes[2] = plaqueMesh;
      if (meta.id === 'E') this.slotPlaqueMeshes[3] = plaqueMesh;
    }

    // Active Cutter Glowing Halo
    const haloGeo = new THREE.RingGeometry(0.48, 0.6, 36);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82,
    });
    this.activeSlotHalo = new THREE.Mesh(haloGeo, haloMat);
    this.activeSlotHalo.rotation.x = -Math.PI / 2;
    this.activeSlotHalo.position.set(
      SEAT_3D_POSITIONS.B.x,
      0.018,
      SEAT_3D_POSITIONS.B.z
    );
    this.tableGroup.add(this.activeSlotHalo);

    // 3D Golden Dealer Crown Puck (DEALER BUCK)
    const puckGeo = new THREE.CylinderGeometry(0.36, 0.39, 0.09, 32);
    const puckTopMat = new THREE.MeshStandardMaterial({
      map: getDealerPuckTexture(this.renderer),
      roughness: 0.22,
      metalness: 0.35,
    });
    const puckSideMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.2,
      metalness: 0.9,
    });
    const puckMesh = new THREE.Mesh(puckGeo, [puckSideMat, puckTopMat, puckSideMat]);
    puckMesh.position.y = 0.045;
    puckMesh.castShadow = !this.isSoftwareGl;
    this.dealerPuckGroup.add(puckMesh);

    const puckShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), this.cardShadowMat);
    puckShadow.rotation.x = -Math.PI / 2;
    puckShadow.position.y = 0.006;
    this.dealerPuckGroup.add(puckShadow);

    this.dealerPuckGroup.position.copy(SEAT_PUCK_POSITIONS.A);
    this.tableGroup.add(this.dealerPuckGroup);
  }

  /**
   * Synchronizes the 3D plaques, active Betting Amount Chips, Golden Dealer Puck,
   * and Glowing Cutter Halo across all 6 seats (A-F).
   */
  public async syncSeats3D(
    dealerSeat: SeatId,
    cutterSeat: SeatId,
    seats: SeatInfo[],
    animatePuck = false
  ): Promise<void> {
    for (const s of seats) {
      const mesh = this.seatPlaqueMeshes[s.id];
      if (!mesh) continue;

      const isDealer = s.id === dealerSeat;
      const isCutter = s.id === cutterSeat;
      const title = s.isHuman
        ? `SEAT ${s.id} • YOU ${isDealer ? '👑' : isCutter ? '✂️' : ''}`
        : `SEAT ${s.id} • ${s.shortName.toUpperCase()} ${isDealer ? '👑' : isCutter ? '✂️' : ''}`;

      let sub = isDealer
        ? `👑 UNDER (SHUFFLER) • ${s.balance} RC`
        : isCutter
        ? `✂️ BAHAR CUTTER • ${s.balance} RC`
        : `${s.balance} RC`;
      if (!isDealer && s.betSide && s.betAmount > 0) {
        const sideLabel = s.betSide === 'dealer' ? 'ANDAR' : 'BAHAR';
        sub = `${isCutter ? '✂️ ' : ''}BET ${s.betAmount} RC (${sideLabel})`;
      }

      const borderColor = isDealer
        ? '#f59e0b'
        : isCutter
        ? '#38bdf8'
        : s.isHuman
        ? '#34d399'
        : '#fbbf24';
      const bgColor = isDealer
        ? '#451a03'
        : isCutter
        ? '#082f49'
        : s.isHuman
        ? '#064e3b'
        : '#090d16';

      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.map = getTablePlaqueTexture(title.trim(), sub, borderColor, bgColor, this.renderer);
      mat.needsUpdate = true;
    }

    // Render ONLY the active betting amount chips on the table
    this.renderActiveBetChips(seats);

    // Move glowing cutter halo to Cutter's seat
    const cutterPos = SEAT_3D_POSITIONS[cutterSeat];
    if (cutterPos) {
      this.activeSlotHalo.position.set(cutterPos.x, 0.018, cutterPos.z);
    }

    // Move 3D Golden Dealer Crown Puck to Dealer's seat
    const targetPos = SEAT_PUCK_POSITIONS[dealerSeat] || SEAT_PUCK_POSITIONS.A;
    if (!animatePuck) {
      this.dealerPuckGroup.position.copy(targetPos);
      return;
    }

    const startPos = this.dealerPuckGroup.position.clone();
    await this.runTween(0.45, (progress, ease) => {
      this.dealerPuckGroup.position.lerpVectors(startPos, targetPos, ease);
      this.dealerPuckGroup.position.y = 0.01 + Math.sin(progress * Math.PI) * 0.4;
      this.dealerPuckGroup.rotation.y = progress * Math.PI * 2;
    });
    this.dealerPuckGroup.position.copy(targetPos);
    this.dealerPuckGroup.rotation.y = 0;
    this.spawnGoldenShockwave(targetPos);
  }

  public setActivePlayerSlot(slotId: PlayerSlotId) {
    this.activeSlotId = slotId;
  }

  public async setDealerRole(dealer: Participant, animate = true): Promise<void> {
    this.currentDealerRole = dealer;
    void animate;
  }

  /**
   * Requirement 4: Only the betting amount chips appear on the table!
   * Dynamically builds 3D casino chip stacks inside each player's betting ring
   * matching their exact `betAmount` (0 chips when `betAmount === 0`).
   */
  private buildChipStacks() {
    this.tableGroup.add(this.chipsGroup);
  }

  public renderActiveBetChips(seats: SeatInfo[]) {
    while (this.chipsGroup.children.length > 0) {
      this.chipsGroup.remove(this.chipsGroup.children[0]);
    }

    const chipGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.048, 24);
    const chipShadowGeo = new THREE.PlaneGeometry(0.62, 0.62);

    const denomStyles: Array<{ denom: number; color: string }> = [
      { denom: 500, color: '#6d28d9' },
      { denom: 250, color: '#15803d' },
      { denom: 100, color: '#b91c1c' },
      { denom: 50, color: '#1d4ed8' },
    ];

    for (const s of seats) {
      if (s.betAmount <= 0 || !s.betSide) continue;
      const pos = SEAT_3D_POSITIONS[s.id];
      if (!pos) continue;

      let remaining = s.betAmount;
      const chipsToStack: Array<{ denom: number; color: string }> = [];
      for (const d of denomStyles) {
        while (remaining >= d.denom && chipsToStack.length < 10) {
          chipsToStack.push(d);
          remaining -= d.denom;
        }
      }
      if (chipsToStack.length === 0) {
        chipsToStack.push({ denom: 50, color: '#1d4ed8' });
      }

      const sh = new THREE.Mesh(chipShadowGeo, this.cardShadowMat);
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(pos.x, 0.008, pos.z);
      this.chipsGroup.add(sh);

      chipsToStack.forEach((c, idx) => {
        const chipTex = getChipTexture(c.denom, c.color, '#f8fafc', this.renderer);
        const topBottomMat = new THREE.MeshStandardMaterial({
          map: chipTex,
          color: 0xffffff,
          roughness: 0.28,
          metalness: 0.18,
        });
        const sideMat = new THREE.MeshStandardMaterial({
          color: c.color,
          roughness: 0.38,
          metalness: 0.12,
        });

        const chipMesh = new THREE.Mesh(chipGeo, [sideMat, topBottomMat, topBottomMat]);
        chipMesh.position.set(pos.x, 0.03 + idx * 0.05, pos.z);
        chipMesh.rotation.y = (idx * 0.65) % (Math.PI * 2);
        chipMesh.castShadow = !this.isSoftwareGl;
        this.chipsGroup.add(chipMesh);
      });
    }
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
      const subGeo = new THREE.BoxGeometry(1.12, thickness, 1.58);

      const materials = [
        this.cardStackEdgeMaterial,
        this.cardStackEdgeMaterial,
        this.cardBackRedMaterial,
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
      const subGeo = new THREE.BoxGeometry(1.12, thickness, 1.58);

      const materials = [
        this.cardStackEdgeMaterial,
        this.cardStackEdgeMaterial,
        this.cardBackBlueMaterial,
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

      const topGeo = new THREE.BoxGeometry(1.12, topThick, 1.58);
      const bottomGeo = new THREE.BoxGeometry(1.12, bottomThick, 1.58);

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
      this.cutBottomHalfMesh.geometry = new THREE.BoxGeometry(1.12, bottomThick, 1.58);
      this.cutBottomHalfMesh.position.y = bottomThick / 2;

      this.cutTopHalfMesh.geometry.dispose();
      this.cutTopHalfMesh.geometry = new THREE.BoxGeometry(1.12, topThick, 1.58);
      this.cutTopHalfMesh.position.set(shiftX, bottomThick + liftY, 0);
      this.cutTopHalfMesh.rotation.z = -tiltDeg;
    }
  }

  /**
   * Clears previous round cards and optionally runs the 3D riffle shuffle animation.
   */
  public async resetRoundAnimation(autoShuffle = true): Promise<void> {
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

    if (autoShuffle) {
      await this.animateRiffleShuffle();
    }
  }

  /**
   * Dramatic 3D Riffle & Bridge Shuffle animation (triggered automatically when Bot is Dealer,
   * or interactively by the Player when the Player won and became the Dealer!).
   */
  public async animateRiffleShuffle(): Promise<void> {
    soundEngine.playShuffleRiffle();

    const shuffleCards: THREE.Mesh[] = [];
    const packetCount = 10;
    const tempGeo = new THREE.BoxGeometry(1.12, 0.02, 1.58);
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
      mesh.position.set(DECK1_POS.x + (isLeft ? -0.82 : 0.82), 0.48 + i * 0.04, DECK1_POS.z);
      mesh.rotation.z = isLeft ? 0.22 : -0.22;
      this.tableGroup.add(mesh);
      shuffleCards.push(mesh);
    }

    await this.runTween(0.46, (progress, ease) => {
      shuffleCards.forEach((c, idx) => {
        const isLeft = idx % 2 === 0;
        const startX = DECK1_POS.x + (isLeft ? -0.82 : 0.82);
        const bridgeArc = Math.sin(progress * Math.PI) * 0.35;
        c.position.x = THREE.MathUtils.lerp(startX, DECK1_POS.x, ease);
        c.position.y =
          THREE.MathUtils.lerp(0.48 + idx * 0.04, DECK1_POS.y + idx * 0.02, ease) + bridgeArc;
        c.rotation.z = THREE.MathUtils.lerp(isLeft ? 0.22 : -0.22, 0, ease);
      });
    });

    shuffleCards.forEach((c) => this.tableGroup.remove(c));
    tempGeo.dispose();
    this.renderDeckStacks(52, 0);
    this.spawnGoldenShockwave(DECK1_POS);
  }

  public async animateSplitAndReveal(
    cutIndex: number,
    pointCard: Card,
    onSplitLanded?: () => void
  ): Promise<void> {
    const deck1Remain = cutIndex;
    const deck2Total = 52 - cutIndex;

    const cutPacketThick = Math.max(0.035, deck2Total * 0.0085);
    const packetGeo = new THREE.BoxGeometry(1.12, cutPacketThick, 1.58);
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
    const endPos = new THREE.Vector3(HUKAM_POS.x, 0.22, HUKAM_POS.z);

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

    const isPlayerMat = toSide === 'player';
    const matCenter = isPlayerMat ? PLAYER_MAT_POS : DEALER_MAT_POS;

    // Strict boundary enforcement:
    // Cards MUST NEVER enter the Hukam pedestal territory (starts at x = 1.44)
    // or spill outside the green mat borders.
    // 6 cards per row, cascading neatly down in Z as more cards are dealt.
    const cardsPerRow = 6;
    const col = (cardCountOnMat - 1) % cardsPerRow;
    const row = Math.floor((cardCountOnMat - 1) / cardsPerRow);

    // Bahar (Dealer): safe card center range [-0.22, +0.50], leaving > 37cm clear margin to Hukam pedestal
    // Andar (Player): safe card center range [-0.40, +0.40], strictly inside the player mat
    const baseStartX = isPlayerMat ? -0.40 : -0.22;
    const strideX = isPlayerMat ? 0.16 : 0.145;
    const fanX = baseStartX + col * strideX + row * 0.03;
    const fanZ = matCenter.z + row * 0.10 + ((col % 2) - 0.5) * 0.03;
    const fanRotY = (((col * 7) % 9) - 4) * (Math.PI / 180);
    const endY = 0.025 + cardCountOnMat * 0.005;

    const cardGroup = this.createCardGroup(card, fromShoe === 1 ? 'red' : 'blue');
    cardGroup.position.set(startX, startY, startZ);
    cardGroup.rotation.set(Math.PI, 0, 0);
    this.tableGroup.add(cardGroup);

    soundEngine.playCardFlick(isPlayerMat ? 1.05 : 0.95);

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
        Math.sin(progress * Math.PI) * (isPlayerMat ? -0.18 : 0.18);

      cardGroup.position.set(curX, curY, curZ);
      cardGroup.rotation.set(curRotX, curRotY, 0);
    });

    cardGroup.position.set(fanX, endY, fanZ);
    cardGroup.rotation.set(0, fanRotY, 0);

    if (isPlayerMat) {
      this.dealtCardsPlayer.push(cardGroup);
    } else {
      this.dealtCardsDealer.push(cardGroup);
    }

    if (isWinningCard) {
      this.animateWinningCardHighlight(cardGroup, toSide);
    }
  }

  private animateWinningCardHighlight(cardGroup: THREE.Group, winnerSide: Side) {
    const playerWonRound =
      (this.currentDealerRole === 'bot' && winnerSide === 'player') ||
      (this.currentDealerRole === 'player' && winnerSide === 'dealer');

    if (playerWonRound) {
      soundEngine.playWinFanfare();
    } else {
      soundEngine.playLossSting();
    }

    this.spawnVictoryParticles(cardGroup.position, playerWonRound ? 0xfbbf24 : 0xf43f5e);
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

  public setCameraZoom(zoom: number) {
    this.cameraZoom = THREE.MathUtils.clamp(zoom, 0.42, 1.35);
    if (this.onZoomChangeCallback) {
      this.onZoomChangeCallback(this.cameraZoom);
    }
  }

  public zoomCamera(delta: number): number {
    this.setCameraZoom(this.cameraZoom + delta);
    return this.cameraZoom;
  }

  public getCameraZoom(): number {
    return this.cameraZoom;
  }

  public setOnZoomChange(cb: (zoom: number) => void) {
    this.onZoomChangeCallback = cb;
  }

  public setRoundOverOrbit(active: boolean) {
    if (active && !this.isRoundOverOrbit) {
      const lookZ = -0.35;
      this.roundOverOrbitAngle = Math.atan2(this.camera.position.x, this.camera.position.z - lookZ);
    }
    this.isRoundOverOrbit = active;
    if (!active) {
      this.roundOverOrbitAngle = 0;
    }
  }

  public getHardwareProfileLabel(): string {
    return this.hardwareProfileLabel;
  }

  private onWindowResize = () => {
    if (!this.container || this.destroyed) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.targetPixelRatio = this.isSoftwareGl ? 1 : Math.min(dpr, 3.5);
    this.renderer.setPixelRatio(this.targetPixelRatio);
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

      // Advance slow circular orbit angle when round is over
      if (this.isRoundOverOrbit) {
        this.roundOverOrbitAngle += dt * 0.45;
      }

      // Subtle breathing and head gaze motion on the 3D Croupier & Seated Bot Challengers
      this.croupierGroup.position.y = -0.12 + Math.sin(now * 0.0022) * 0.025;
      const croupierHead = this.croupierGroup.getObjectByName('characterHead');
      if (croupierHead) {
        croupierHead.rotation.y = Math.sin(now * 0.0011) * 0.14;
      }

      const slotIds: PlayerSlotId[] = [1, 2, 3];
      for (const id of slotIds) {
        const botChar = this.slotCharacterGroups[id];
        if (botChar && botChar.visible) {
          botChar.position.y = -0.16 + Math.sin(now * 0.002 + id * 1.4) * 0.02;
          const head = botChar.getObjectByName('characterHead');
          if (head) {
            head.rotation.y = Math.sin(now * 0.0009 + id * 2.1) * 0.12;
          }
        }
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
