"""Sign-preserving SPARC baryonic decomposition and projection sensitivity."""
import math

def signed_square(velocity):
    if not math.isfinite(velocity):
        raise ValueError('velocity must be finite')
    return math.copysign(velocity*velocity, velocity)

def baryonic_v2(gas, disk, bulge, upsilon_disk=.5, upsilon_bulge=.7):
    """SPARC signed gas/disk/bulge velocity-squared convention (km/s)^2."""
    if min(upsilon_disk, upsilon_bulge) < 0:
        raise ValueError('negative mass-to-light ratio')
    return signed_square(gas)+upsilon_disk*signed_square(disk)+upsilon_bulge*signed_square(bulge)

def halo_v2(observed, gas, disk, bulge, upsilon_disk=.5, upsilon_bulge=.7):
    """Algebraic halo v^2 residual; negative values are not physical halo speeds."""
    if observed < 0 or not math.isfinite(observed):
        raise ValueError('observed speed must be nonnegative and finite')
    return observed**2-baryonic_v2(gas,disk,bulge,upsilon_disk,upsilon_bulge)

def inclination_sensitivity(v_los, inclination_deg, sigma_los, sigma_inclination_deg):
    """Projected speed and first-order variance for independent LOS and angle errors."""
    if not all(math.isfinite(x) for x in (v_los,inclination_deg,sigma_los,sigma_inclination_deg)):
        raise ValueError('inputs must be finite')
    if not 0 < inclination_deg < 90 or min(v_los,sigma_los,sigma_inclination_deg) < 0:
        raise ValueError('invalid inclination, velocity or uncertainties')
    rad=math.radians(inclination_deg)
    s,c=math.sin(rad),math.cos(rad)
    v=v_los/s
    variance=(sigma_los/s)**2+(v_los*c/s**2*math.radians(sigma_inclination_deg))**2
    return v,math.sqrt(variance)
