"""Conditional SPARC-style baryonic and inclination sensitivity (standard library)."""
import math
import unittest

def signed_square(v):
    if not math.isfinite(v): raise ValueError("nonfinite velocity")
    return math.copysign(v*v, v) if v else 0.

def baryonic_v2(gas, disk, bulge, disk_ml, bulge_ml):
    if not all(math.isfinite(x) for x in (disk_ml, bulge_ml)) or min(disk_ml, bulge_ml) < 0:
        raise ValueError("invalid mass-to-light ratio")
    return signed_square(gas)+disk_ml*signed_square(disk)+bulge_ml*signed_square(bulge)

def inclination_corrected_velocity(v_los, inclination_deg):
    if not (math.isfinite(v_los) and 0 < inclination_deg <= 90):
        raise ValueError("invalid inclination")
    return v_los/math.sin(math.radians(inclination_deg))

def inclination_sigma(v_los, inclination_deg, sigma_v, sigma_inclination_deg):
    """First-order propagation assuming independent LOS velocity and angle errors."""
    if min(sigma_v, sigma_inclination_deg) < 0 or not all(math.isfinite(x) for x in (sigma_v, sigma_inclination_deg)):
        raise ValueError("invalid uncertainty")
    v = inclination_corrected_velocity(v_los, inclination_deg)
    i = math.radians(inclination_deg)
    return math.hypot(sigma_v/math.sin(i), v/math.tan(i)*math.radians(sigma_inclination_deg))

def mass_discrepancy(v_los, i_deg, gas, disk, bulge, disk_ml, bulge_ml):
    return inclination_corrected_velocity(v_los, i_deg)**2-baryonic_v2(gas,disk,bulge,disk_ml,bulge_ml)

class Tests(unittest.TestCase):
    def test_negative_gas(self): self.assertEqual(baryonic_v2(-3,4,0,1,0),7)
    def test_ml(self): self.assertEqual(baryonic_v2(0,4,3,2,1),41)
    def test_edgeon(self): self.assertAlmostEqual(inclination_corrected_velocity(100,90),100)
    def test_inclination(self): self.assertAlmostEqual(inclination_corrected_velocity(50,30),100)
    def test_sigma_edgeon(self): self.assertAlmostEqual(inclination_sigma(100,90,2,1),2)
    def test_discrepancy(self): self.assertAlmostEqual(mass_discrepancy(50,30,0,60,0,1,0),6400)
    def test_invalid(self):
        with self.assertRaises(ValueError): inclination_corrected_velocity(50,0)
        with self.assertRaises(ValueError): baryonic_v2(1,2,3,-1,1)

if __name__=="__main__": unittest.main()
