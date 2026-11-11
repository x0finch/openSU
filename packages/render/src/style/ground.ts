import { type Box3, type Material, Mesh, PlaneGeometry, Vector3 } from 'three';

/**
 * Shadow catcher. The ground is shaded with the same illustration material
 * as everything else (white albedo), so lit ground equals the white
 * background exactly and only received shadows are visible.
 */
export function createGround(bounds: Box3, material: Material): Mesh {
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const extent = Math.max(size.x, size.z) * 8 + 50;
  const geo = new PlaneGeometry(extent, extent);
  geo.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geo, material);
  mesh.position.set(center.x, 0, center.z);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'ground';
  mesh.userData.edges = false;
  mesh.renderOrder = -1;
  return mesh;
}
