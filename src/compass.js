// Compass heading from the phone's orientation sensors (W3C DeviceOrientation: alpha around the
// vertical, then beta front-to-back tilt, then gamma left-to-right tilt; alpha 0 = top towards north
// for an absolute reading).
//
// Built-in compass apps allow for tilt; using alpha alone is only right when the phone lies flat.
// This takes whichever of two directions is closer to level: the top edge of the phone (lying flat
// or tilted a little) or the direction the back camera looks (held up in front of you). Either way
// it is the way you point the phone. Returns degrees clockwise from north, and which edge was used.
const RAD = Math.PI / 180;
const mod = (n, m) => ((n % m) + m) % m;

export function headingFromOrientation(alpha, beta, gamma) {
  const cA = Math.cos(alpha * RAD); const sA = Math.sin(alpha * RAD);
  const cB = Math.cos(beta * RAD); const sB = Math.sin(beta * RAD);
  const cG = Math.cos(gamma * RAD); const sG = Math.sin(gamma * RAD);
  // The phone's axes in earth coordinates (x east, y north, z up).
  const top = [-sA * cB, cA * cB];
  const back = [-(cA * sG + sA * sB * cG), -(sA * sG - cA * sB * cG)];
  const level = (v) => Math.hypot(v[0], v[1]);
  const useTop = level(top) >= level(back);
  const [e, n] = useTop ? top : back;
  return { heading: mod(Math.atan2(e, n) / RAD, 360), edge: useTop ? 'top' : 'back' };
}
