// WS-WORLD · DEV ONLY placeholder for the level-0 room, used by harness.html?devroom=1 while WS-OFFICE's bedroom
// (world/bedroom/**) is still a stub. Never imported by the app. Implements just enough of BedroomModel to test
// framing, the boom timing and the pixel pass.
import * as THREE from "three";
import type { BedroomModel, CreateBedroomModel } from "../contracts";

export const createDevRoom: CreateBedroomModel = () => {
  const root = new THREE.Group();
  root.name = "dev-room";
  const W = 6, D = 5, H = 2.4;
  const M = (c: string) => new THREE.MeshLambertMaterial({ color: c });
  const box = (w: number, h: number, d: number, c: string, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c));
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    return m;
  };
  const floor = box(W, 0.2, D, "#D9B48A", 0, -0.1, 0);
  const wallBack = new THREE.Group(), wallLeft = new THREE.Group();
  wallBack.position.set(0, 0, -D / 2);
  wallBack.add(box(W, H, 0.16, "#E9DCC6", 0, H / 2, 0.08), box(1.4, 0.9, 0.05, "#9CC9E8", 1.2, 1.5, 0.18));
  wallLeft.position.set(-W / 2, 0, 0);
  wallLeft.add(box(0.16, H, D, "#F2E6D3", 0.08, H / 2, 0), box(0.05, 0.8, 1.1, "#C9A27A", 0.18, 1.4, -0.8));
  const props = new THREE.Group();
  props.add(box(1.6, 0.45, 2.2, "#7FA7D9", -1.9, 0.22, -1.2), box(1.6, 0.2, 0.6, "#FFFFFF", -1.9, 0.5, -2));
  props.add(box(1.5, 0.08, 0.7, "#8C6A4F", 1.4, 0.75, -1.9), box(0.08, 0.75, 0.6, "#6F533E", 0.7, 0.37, -1.9), box(0.08, 0.75, 0.6, "#6F533E", 2.1, 0.37, -1.9));
  props.add(box(0.5, 0.3, 0.04, "#2C2F3A", 1.4, 0.95, -2.1));
  props.add(box(1.8, 0.02, 1.4, "#E7A9A0", 0.4, 0.01, 0.4));
  const founder = new THREE.Group();
  founder.add(box(0.36, 0.5, 0.26, "#0AC18E", 0, 0.75, 0), box(0.3, 0.3, 0.3, "#F1C6A4", 0, 1.17, 0));
  founder.position.set(1.4, 0, -1.3);
  props.add(founder);
  root.add(floor, wallBack, wallLeft, props);
  const bounds = new THREE.Box3(new THREE.Vector3(-W / 2, -0.2, -D / 2), new THREE.Vector3(W / 2, H, D / 2));
  const m: BedroomModel = {
    root,
    bounds: () => bounds.clone(),
    focusBounds: () => bounds.clone(),
    setRoster() {},
    setActorState() {},
    actorAnchor: (id) => (id === "founder" ? new THREE.Vector3(1.4, 1.5, -1.3) : null),
    pickActor: () => null,
    setSign() {},
    pulse() {},
    setBoom(k) {
      const e = Math.min(1, k * 1.4);
      wallBack.rotation.x = -e * (Math.PI / 2);
      wallLeft.rotation.z = e * (Math.PI / 2);
      props.scale.setScalar(Math.max(0.001, 1 - Math.min(1, k * 2.2)));
      root.visible = k < 1;
    },
    applyAtmosphere() {},
    update: () => false,
    dispose() {
      root.traverse((o) => o instanceof THREE.Mesh && (o.geometry.dispose(), (o.material as THREE.Material).dispose()));
    },
  };
  return m;
};
